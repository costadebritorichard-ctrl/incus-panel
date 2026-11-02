import struct
import threading
import time
import unittest
from unittest.mock import patch

from incus_panel.console import Console, WebSocket
from incus_panel.core import PanelError
from incus_panel.server import Application, demo_config, password_hash


class Socket:
    def __init__(self, data=b""):
        self.data=data
        self.sent=b""
    def recv(self, count):
        result,self.data=self.data[:count],self.data[count:]
        return result
    def sendall(self,data):
        self.sent+=data


def ws(data=b""):
    result=object.__new__(WebSocket)
    result.sock=Socket(data)
    result.send_lock=threading.Lock()
    return result


class Frames(unittest.TestCase):
    def test_masked_client_frame_round_trip(self):
        for payload in (b"ls\n",b"x"*200,b"x"*70000):
            channel=ws()
            channel.send(payload)
            frame=channel.sock.sent
            self.assertTrue(frame[1]&128)
            marker=frame[1]&127
            offset=2 if marker<126 else 4 if marker==126 else 10
            mask=frame[offset:offset+4]
            decoded=bytes(v^mask[i%4] for i,v in enumerate(frame[offset+4:]))
            self.assertEqual(decoded,payload)

    def test_server_binary_frame(self):
        self.assertEqual(ws(b'\x82\x03abc').receive(),b'abc')

    def test_fragmented_message(self):
        self.assertEqual(ws(b'\x02\x02ab\x80\x02cd').receive(),b'abcd')

    def test_ping_between_fragments(self):
        channel=ws(b'\x02\x02ab\x89\x01?\x80\x02cd')
        self.assertEqual(channel.receive(),b'abcd')
        self.assertEqual(channel.sock.sent[0]&15,10)

    def test_frame_limit(self):
        with self.assertRaises(PanelError):
            ws(b'\x82\x7f'+struct.pack('!Q',1048577)).receive()

    def test_closed_channel(self):
        with self.assertRaises(EOFError):
            ws(b'\x88\x00').receive()

    def test_masked_server_or_rsv_rejected(self):
        for data in (b'\x82\x81',b'\xc2\x00'):
            with self.assertRaises(PanelError):
                ws(data).receive()


class FakeConsole:
    def __init__(self,client,project,target,deadline):
        self.closed=False
        self.deadline=deadline
        self.last_access=time.time()
        self.last_auth=time.time()
    def close(self):
        self.closed=True


class InteractiveTerminal(unittest.TestCase):
    def console(self):
        result = object.__new__(Console)
        result.closed = False
        result.lock = threading.RLock()
        result.last_access = 0
        result.output = ''
        result.channels = []
        return result

    def test_exec_opens_data_and_control_with_xterm_environment(self):
        from unittest.mock import Mock
        client = Mock()
        operation = '/1.0/operations/' + 'a' * 8 + '-aaaa-aaaa-aaaa-' + 'a' * 12
        client.request.return_value = {'operation': operation, 'metadata': {'metadata': {'fds': {'0': 'data-secret', 'control': 'control-secret'}}}}
        with patch('incus_panel.console.WebSocket') as channel, patch('incus_panel.console.threading.Thread'):
            console = Console(client, 'project', 'container', time.time() + 60)
        payload = client.request.call_args.args[3]
        self.assertEqual(payload['command'], ['/bin/sh'])
        self.assertTrue(payload['interactive'])
        self.assertTrue(payload['wait-for-websocket'])
        self.assertEqual(payload['environment']['TERM'], 'xterm-256color')
        self.assertEqual(channel.call_count, 2)
        self.assertEqual(channel.call_args_list[0].args[3], 'control-secret')
        self.assertEqual(channel.call_args_list[1].args[3], 'data-secret')
        console.close()

    def test_preserves_color_cursor_and_split_utf8_for_xterm(self):
        console = self.console()
        chunks = iter([b'\x1b[31mOl\xc3', b'\xa1\x1b[0m\r\n\x1b[2J\x1b[H'])
        class Data:
            def receive(self):
                try:
                    return next(chunks)
                except StopIteration:
                    raise EOFError()
        console.data = Data()
        console.receive()
        output = console.read()
        self.assertEqual(output['output'], '\x1b[31mOlá\x1b[0m\r\n\x1b[2J\x1b[H')
        self.assertTrue(output['closed'])
        self.assertEqual(console.read()['output'], '')

    def test_direct_keyboard_control_sequences_reach_incus(self):
        from unittest.mock import Mock
        console = self.console()
        console.data = Mock()
        for text in ('ls\r', '\x03', '\t', '\x1b[A', '\x1b[200~pasted\x1b[201~'):
            console.write(text)
            console.data.send.assert_called_with(text)
        with self.assertRaises(PanelError):
            console.write('x' * 4097)

    def test_resize_control_protocol_and_invalid_dimensions(self):
        from unittest.mock import Mock
        import json
        console = self.console()
        console.control = Mock()
        console.resize(120, 40)
        message, opcode = console.control.send.call_args.args
        self.assertEqual(json.loads(message), {'command': 'window-resize', 'args': {'width': '120', 'height': '40'}})
        self.assertEqual(opcode, 1)
        self.assertGreater(console.last_access, 0)
        for width, height in ((0, 30), (301, 30), (100, 101), ('bad', 30), (True, 30), (80.5, 30)):
            with self.assertRaises(PanelError):
                console.resize(width, height)
        console.closed = True
        with self.assertRaises(PanelError):
            console.resize(100, 30)


class ConsoleAuthorization(unittest.TestCase):
    def setUp(self):
        self.config=demo_config()
        self.config['enable_console']=True
        self.config['users']=[{'username':'op','password_hash':password_hash('test-password'),'role':'operador','scopes':{'demo':['laboratorio']}}]
        self.app=Application(self.config)
        self.token,self.session=self.app.login('op','test-password','local')
        self.body={'host':'demo','project':'laboratorio','target':'lab-web','confirmation':'demo/laboratorio/lab-web'}

    def open(self):
        with patch('incus_panel.server.Console',FakeConsole):
            return self.app.open_console(self.token,self.session,self.body)['console']

    def test_ct012_stopped_console_blocked(self):
        self.body.update(target='lab-db',confirmation='demo/laboratorio/lab-db')
        with self.assertRaises(PanelError) as result:
            self.open()
        self.assertEqual(result.exception.status,409)

    def test_observer_and_readonly_console_blocked(self):
        self.session['user']['role']='observador'
        with self.assertRaises(PanelError):self.open()
        self.session['user']['role']='operador'
        self.config['read_only']=True
        with self.assertRaises(PanelError):self.open()

    def test_ct011_expired_session_closes_console(self):
        console_id=self.open()
        console=self.app.console(self.token,console_id)
        self.session['expires']=0
        with self.assertRaises(PanelError):self.app.session(self.token)
        self.assertTrue(console.closed)

    def test_logout_closes_console(self):
        console_id=self.open()
        console=self.app.console(self.token,console_id)
        self.app.close_consoles(self.token)
        self.assertTrue(console.closed)
        self.assertEqual(self.app.consoles,{})

    def test_other_session_cannot_read_console(self):
        console_id=self.open()
        other_token,_=self.app.login('op','test-password','other')
        with self.assertRaises(PanelError):self.app.console(other_token,console_id)

    def test_abandoned_tab_closes_console(self):
        console_id=self.open()
        console=self.app.console(self.token,console_id)
        console.last_access-=31
        self.app.reap()
        self.assertTrue(console.closed)
        self.assertEqual(self.app.consoles,{})

    def test_requires_exact_target_confirmation(self):
        self.body['confirmation']='demo/redes/lab-web'
        with self.assertRaises(PanelError):self.open()

    def test_one_console_per_session(self):
        self.open()
        with self.assertRaises(PanelError) as result:self.open()
        self.assertEqual(result.exception.status,429)

    def test_administrator_can_open_console_on_a_new_managed_container(self):
        self.config['manage_all_instances'] = True
        self.session['user']['role'] = 'administrador'
        self.config['mutable_instances'] = {}
        self.assertTrue(self.open())

    def test_closed_console_output_survives_cleanup_until_read(self):
        console_id = self.open()
        console = self.app.console(self.token, console_id)
        console.closed = True
        self.app.reap()
        self.assertIs(self.app.console(self.token, console_id), console)
        # A closed shell must not block reconnecting.
        self.assertNotEqual(self.open(), console_id)


if __name__=='__main__':unittest.main()
