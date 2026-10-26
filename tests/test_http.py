"""Integração HTTP sem rede: handler executado sobre streams em memória."""
import io
import json
import unittest
from types import SimpleNamespace

from incus_panel.server import Application, Handler, demo_config, password_hash


class FakeSocket:
    def __init__(self, request):
        self.input=io.BytesIO(request)
        self.output=io.BytesIO()
    def makefile(self,*args,**kwargs):
        return self.input
    def sendall(self,data):
        self.output.write(data)
    def settimeout(self,*args):
        pass


class HttpContracts(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.config=demo_config()
        cls.config["users"]=[{"username":"test","password_hash":password_hash("test-password"),"role":"observador","scopes":{"demo":["laboratorio"]}}]

    def setUp(self):
        self.app=Application(self.config)
        self.token,self.session=self.app.login("test","test-password","local")

    def request(self, path, body=None, cookie=True, origin=None, csrf=None, raw=None):
        method="POST" if body is not None or raw is not None else "GET"
        data=raw if raw is not None else json.dumps(body).encode() if body is not None else b""
        headers={"Host":"127.0.0.1:8080"}
        if cookie: headers["Cookie"]="panel_session="+self.token
        if method=="POST":
            headers.update({"Content-Type":"application/json","Content-Length":str(len(data)),"Origin":origin or self.config["origin"]})
        if csrf:headers["X-CSRF-Token"]=csrf
        request=(method+" "+path+" HTTP/1.0\r\n"+"".join(k+": "+v+"\r\n" for k,v in headers.items())+"\r\n").encode()+data
        sock=FakeSocket(request)
        Handler(sock,("127.0.0.1",1234),SimpleNamespace(app=self.app))
        head,body=sock.output.getvalue().split(b"\r\n\r\n",1)
        code=int(head.split(b" ")[1])
        return code,head,body

    def test_private_data_requires_session(self):
        self.assertEqual(self.request('/api/read?host=demo&project=laboratorio&resource=instances',cookie=False)[0],401)

    def test_scope_enforced_over_http(self):
        self.assertEqual(self.request('/api/read?host=demo&project=redes&resource=instances')[0],403)

    def test_read_instance(self):
        code,headers,body=self.request('/api/read?host=demo&project=laboratorio&resource=instances')
        self.assertEqual(code,200)
        self.assertEqual(len(json.loads(body)["data"]),2)
        self.assertIn(b"no-store",headers)
        self.assertIn(b"Content-Security-Policy",headers)

    def test_csrf_required(self):
        self.assertEqual(self.request('/api/logout',{})[0],403)
        self.assertEqual(self.request('/api/logout',{},csrf=self.session["csrf"],origin="https://evil.test")[0],403)

    def test_logout_invalidates_session(self):
        self.assertEqual(self.request('/api/logout',{},csrf=self.session["csrf"])[0],200)
        self.assertEqual(self.request('/api/session')[0],401)

    def test_invalid_json(self):
        self.assertEqual(self.request('/api/login',raw=b'[]')[0],400)
        self.assertEqual(self.request('/api/login',raw=b'{')[0],400)

    def test_static_allowlist_prevents_file_exposure(self):
        for path in ('/config.local.json','/especificacao/00_manifesto_e_escopo.json','/../incus_panel/server.py','/.git/config'):
            self.assertEqual(self.request(path)[0],404)

    def test_static_assets_exist(self):
        for path in ('/','/app.js','/style.css'):
            self.assertEqual(self.request(path)[0],200)

    def test_login_cookie_flags(self):
        code,headers,body=self.request('/api/login',{"username":"test","password":"test-password"},cookie=False)
        self.assertEqual(code,200)
        self.assertIn(b"HttpOnly",headers)
        self.assertIn(b"SameSite=Strict",headers)
        self.assertNotIn(b"password_hash",body)


if __name__=='__main__':
    unittest.main()
