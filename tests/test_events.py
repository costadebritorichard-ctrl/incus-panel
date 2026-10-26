import time
import unittest
from unittest.mock import patch

from incus_panel.events import Events


class Channel:
    def __init__(self, receive):
        self.receive = receive
        self.closed = False
    def close(self):
        self.closed = True


class EventContracts(unittest.TestCase):
    def event(self):
        with patch('incus_panel.events.threading.Thread'):
            return Events(object(), 'laboratorio', time.time()+60)

    def test_event_invalidates_rest_without_exposing_payload(self):
        event=self.event()
        def receive():
            event.stop.set()
            return b'{"type":"lifecycle","project":"laboratorio","metadata":{"secret":"not-for-browser"}}'
        channel=Channel(receive)
        with patch('incus_panel.events.WebSocket',return_value=channel):event.run()
        self.assertEqual(event.version,2)
        self.assertNotIn('secret',str(event.read()))
        self.assertTrue(channel.closed)

    def test_foreign_project_event_is_ignored(self):
        event=self.event()
        def receive():
            event.stop.set()
            return b'{"type":"lifecycle","project":"outside"}'
        with patch('incus_panel.events.WebSocket',return_value=Channel(receive)):event.run()
        self.assertEqual(event.version,1)

    def test_ct005_reconnection_always_requires_rest_resync(self):
        event=self.event()
        first=Channel(lambda: (_ for _ in ()).throw(EOFError()))
        def receive():
            event.stop.set()
            return b'{"type":"operation","project":"laboratorio"}'
        second=Channel(receive)
        with patch('incus_panel.events.WebSocket',side_effect=[first,second]) as websocket, patch.object(event.stop,'wait',return_value=False):
            event.run()
        self.assertEqual(websocket.call_count,2)
        self.assertEqual(event.version,3)
        self.assertTrue(event.read()['resync'])


if __name__=='__main__':unittest.main()
