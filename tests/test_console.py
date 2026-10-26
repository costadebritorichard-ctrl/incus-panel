import struct
import threading
import time
import unittest
from unittest.mock import patch

from incus_panel.console import WebSocket
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


if __name__=='__main__':unittest.main()
