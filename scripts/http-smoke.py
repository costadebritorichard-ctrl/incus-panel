"""Smoke HTTP real de demonstração; não usa Incus nem credenciais permanentes."""
import http.cookiejar
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import urllib.request

ROOT=Path(__file__).resolve().parent.parent
ORIGIN='http://127.0.0.1:18080'


def main():
    process=subprocess.Popen([sys.executable,'-m','incus_panel.server','--demo','--port','18080'],cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,encoding='utf-8',env={**os.environ,'PYTHONIOENCODING':'utf-8'})
    try:
        first=process.stdout.readline()
        password=first.rsplit(': ',1)[-1].strip()
        ready=process.stdout.readline()
        if 'disponível' not in ready:raise RuntimeError('Servidor de smoke não iniciou.')
        browser=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        def request(path,body=None,csrf=None):
            headers={'Origin':ORIGIN,'Content-Type':'application/json'}
            if csrf:headers['X-CSRF-Token']=csrf
            data=json.dumps(body).encode() if body is not None else None
            with browser.open(urllib.request.Request(ORIGIN+path,data=data,headers=headers),timeout=10) as response:
                raw=response.read()
                return json.loads(raw) if response.headers.get_content_type()=='application/json' else raw
        for path in ('/','/app.js','/style.css'):assert request(path)
        session=request('/api/login',{'username':'demo','password':password})
        def read(resource,target=None):
            return request('/api/read?host=demo&project=laboratorio&resource='+resource+('&target='+target if target else ''))['data']
        for resource in ('server','resources','instances','images','profiles','networks','pools','projects','operations'):assert read(resource) is not None
        operation=request('/api/action',{'host':'demo','project':'laboratorio','target':'lab-web','action':'stop','confirmation':'demo/laboratorio/lab-web'},session['csrf'])['operation']
        assert read('operation',operation)['status_code']==200
        assert read('state','lab-web')['status']=='Stopped'
        assert request('/api/logout',{},session['csrf'])['ok']
        print('Smoke HTTP real: assets, login, 9 consultas, lifecycle, UUID, estado e logout aprovados (somente fixture).')
    finally:
        process.terminate()
        process.communicate(timeout=10)


if __name__=='__main__':main()
