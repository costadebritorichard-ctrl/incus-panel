import copy
import json
from pathlib import Path
import unittest
from unittest.mock import patch

from incus_panel.core import Demo, Incus, PanelError, Service, architecture, name, redact, storage_alert
from incus_panel.server import Application, demo_config, password_hash, verify_password


class Contracts(unittest.TestCase):
    def setUp(self):
        self.config = demo_config()
        self.user = {"username": "admin", "role": "administrador", "scopes": {"demo": ["laboratorio"]}, "host_metrics": True}
        self.service = Service(self.config)

    def read(self, resource, target=None):
        return self.service.read(self.user, "demo", "laboratorio", resource, target)

    def act(self, action, target="lab-web", **body):
        return self.service.mutate(self.user, "demo", "laboratorio", action, target, {"confirmation": "demo/laboratorio/" + target, **body})

    def test_all_specification_documents_are_valid(self):
        files = list(Path("especificacao").glob("*.json"))
        self.assertEqual(len(files), 9)
        for file in files:
            self.assertIsInstance(json.loads(file.read_text(encoding="utf-8")), dict)

    def test_ct001_ct014_armv7_does_not_offer_vm_creation(self):
        info = self.read("server")
        self.assertFalse(info["environment"]["server_clustered"])
        self.assertIn("virtual-machines", info["api_extensions"])
        with self.assertRaises(PanelError):
            self.act("create", "lab-novo", image="no-image", type="virtual-machine")

    def test_ct002_project_names_do_not_collide(self):
        self.act("stop")
        client = self.service.hosts["demo"]
        self.assertEqual(client.instances["laboratorio", "lab-web"]["status"], "Stopped")
        self.assertEqual(client.instances["redes", "lab-web"]["status"], "Running")

    def test_ct018_no_cross_project_reads_or_actions(self):
        for method in (lambda: self.service.read(self.user,"demo","redes","instances"), lambda: self.service.mutate(self.user,"demo","redes","stop","lab-web",{})):
            with self.assertRaises(PanelError) as result:
                method()
            self.assertEqual(result.exception.status, 403)
        self.assertEqual(self.read("projects"), [{"name": "laboratorio"}])

    def test_ct008_btrfs_93_percent_is_critical(self):
        result = storage_alert(self.read("pool-resources", "lab"))
        self.assertEqual(result["level"], "crítico")
        self.assertAlmostEqual(result["percent"], 93, places=4)

    def test_ct017_missing_metrics_never_zero(self):
        for data in ({}, {"space": {"total": 0, "used": 0}}, {"space": {"total": 100}}):
            self.assertIsNone(storage_alert(data)["percent"])

    def test_read_only_enforced_server_side(self):
        self.config["read_only"] = True
        with self.assertRaises(PanelError):
            self.act("stop")
        self.assertEqual(self.read("instance", "lab-web")["status"], "Running")

    def test_observer_cannot_mutate(self):
        self.user["role"] = "observador"
        with self.assertRaises(PanelError):
            self.act("stop")

    def test_no_production_or_arbitrary_target(self):
        for target in ("node1", "node2", "php-site", "other", "../secret"):
            with self.assertRaises(PanelError):
                self.act("stop", target)

    def test_wrong_confirmation(self):
        with self.assertRaises(PanelError):
            self.act("stop", confirmation="demo/redes/lab-web")

    def test_state_precondition(self):
        with self.assertRaises(PanelError) as result:
            self.act("start")
        self.assertEqual(result.exception.status, 409)

    def test_operation_is_tracked_not_immediate_success(self):
        operation = self.act("stop")["operation"]
        self.assertEqual(len(operation), 36)
        self.assertEqual(self.service.audit[-1]["result"], "aceita; aguardando Incus")
        self.assertEqual(self.read("operation", operation)["status_code"], 200)

    def test_ct006_uncertain_operation_not_success(self):
        original = self.service.hosts["demo"].request
        def request(method,*args,**kwargs):
            return original(method,*args,**kwargs) if method == "GET" else {"type": "sync", "metadata": {}}
        with patch.object(self.service.hosts["demo"], "request", side_effect=request):
            with self.assertRaises(PanelError):
                self.act("stop")
        self.assertIn("incerto", self.service.audit[-1]["result"])

    def test_ct013_protected_instance(self):
        instance = self.service.hosts["demo"].instances["laboratorio", "lab-db"]
        instance["config"]["security.protection.delete"] = "true"
        with self.assertRaises(PanelError):
            self.act("delete", "lab-db")

    def test_delete_requires_admin_and_stopped(self):
        with self.assertRaises(PanelError):
            self.act("delete")
        self.user["role"] = "operador"
        with self.assertRaises(PanelError):
            self.act("delete", "lab-db")

    def test_delete_fixture(self):
        self.act("delete", "lab-db")
        self.assertEqual([i["name"] for i in self.read("instances")], ["lab-web"])

    def test_ct015_wrong_image_architecture(self):
        client = self.service.hosts["demo"]
        original = client.request
        def request(method,path,*args,**kwargs):
            data = original(method,path,*args,**kwargs)
            if path == "/1.0/images":
                data["metadata"][0]["architecture"] = "aarch64"
            return data
        with patch.object(client,"request",side_effect=request):
            with self.assertRaises(PanelError):
                self.act("create","lab-novo",image="a"*64)

    def test_create_then_duplicate(self):
        self.act("create", "lab-novo", image="a"*64, profiles=["default"])
        self.assertEqual(self.read("instance", "lab-novo")["type"], "container")
        with self.assertRaises(PanelError) as result:
            self.act("create", "lab-novo", image="a"*64)
        self.assertEqual(result.exception.status, 409)

    def test_snapshot_and_backup(self):
        self.assertEqual(self.read("snapshots", "lab-web"), [])
        for action, resource in (("snapshot","snapshots"),("backup","backups")):
            self.act(action, name="test")
            self.assertEqual(self.read(resource,"lab-web")[0]["name"], "test")

    def test_unknown_resource_and_traversal(self):
        for resource,target in (("certificates",None),("instance","../certificates"),("instance","a?project=redes")):
            with self.assertRaises(PanelError):
                self.read(resource,target)

    def test_host_metrics_require_separate_permission(self):
        self.user["host_metrics"] = False
        for resource in ("resources","pools","pool-resources","volumes"):
            with self.assertRaises(PanelError):
                self.read(resource,"lab")

    def test_ct023_redaction(self):
        value = redact({"password": "private", "user.data": "secret", "nested": [{"token":"123", "safe":"normal"}], "pem":"-----BEGIN PRIVATE KEY-----"})
        self.assertNotIn("private", json.dumps(value))
        self.assertEqual(value["nested"][0]["safe"], "normal")

    def test_ssrf_blocked(self):
        for url in ("http://localhost", "https://user:pw@host", "https://host/path", "file:///etc/passwd", "https://host?project=x"):
            with self.assertRaises(ValueError):
                Incus({"url": url})

    def test_incus_tls_ca_and_pin(self):
        config = {"url":"https://incus.test:8443", "ca":"ca", "certificate":"crt", "key":"key", "fingerprint":"a"*64}
        with patch("incus_panel.core.ssl.create_default_context") as context, patch("incus_panel.core.http.client.HTTPSConnection") as connection:
            client = Incus(config)
            connection.return_value.sock.getpeercert.return_value = b"wrong certificate"
            with self.assertRaises(PanelError) as result:
                client.request("GET","/1.0","laboratorio")
            self.assertIn("Fingerprint",str(result.exception))
            connection.return_value.request.assert_not_called()
            context.assert_called_once_with(cafile="ca")
            context.return_value.load_cert_chain.assert_called_once_with("crt","key")

    def test_audit_does_not_cross_users(self):
        self.act("stop")
        self.user["username"] = "another"
        self.assertEqual(self.read("audit"), [])

    def test_password_hash_and_expiry(self):
        encoded = password_hash("test-only-password")
        self.assertTrue(verify_password("test-only-password", encoded))
        self.assertFalse(verify_password("wrong", encoded))
        self.config["users"] = [{**self.user,"password_hash":encoded}]
        app = Application(self.config)
        token, session = app.login("admin", "test-only-password", "local")
        self.assertEqual(app.session(token),session)
        session["expires"] = 0
        with self.assertRaises(PanelError):
            app.session(token)

    def test_login_rate_limit(self):
        app=Application(self.config)
        for _ in range(10):
            with self.assertRaises(PanelError):
                app.login("missing","wrong","local")
        with self.assertRaises(PanelError) as result:
            app.login("missing","wrong","local")
        self.assertEqual(result.exception.status,429)


if __name__ == "__main__":
    unittest.main()
