from pathlib import Path
import tempfile
import unittest

from incus_panel.memory import memory_status


class EffectiveMemory(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.proc = self.root / 'proc'
        self.group = self.root / 'cgroup'
        self.write(self.proc / 'meminfo', 'MemTotal: 8388608 kB\nMemAvailable: 4194304 kB\nMemFree: 100 kB\nSwapFree: 2097152 kB\n')

    def write(self, path, value):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(str(value))

    def read(self):
        return memory_status(self.proc, self.group)

    def test_host_without_visible_limits_uses_memavailable_not_memfree(self):
        result = self.read()
        self.assertEqual(result['total_kib'], 8388608)
        self.assertEqual(result['available_kib'], 4194304)

    def test_cgroup_limit_overrides_larger_host_and_accounts_for_reclaimable_cache(self):
        self.write(self.proc / 'self/cgroup', '0::/vm\n')
        target = self.group / 'vm'
        self.write(target / 'memory.max', 2 * 1024**3)
        self.write(target / 'memory.current', 1900 * 1024**2)
        self.write(target / 'memory.stat', f'inactive_file {200 * 1024**2}\nactive_file {500 * 1024**2}\n')
        self.assertEqual(self.read()['total_kib'], 2048 * 1024)
        self.assertEqual(self.read()['available_kib'], 348 * 1024)
        self.assertEqual(self.read()['limit_source'], str(target))

    def test_parent_limit_applies_when_current_group_is_unlimited(self):
        self.write(self.proc / 'self/cgroup', '0::/vm/installer\n')
        self.write(self.group / 'vm/installer/memory.max', 'max')
        self.write(self.group / 'vm/memory.max', 512 * 1024**2)
        self.write(self.group / 'vm/memory.current', 500 * 1024**2)
        self.assertEqual(self.read()['total_kib'], 512 * 1024)
        self.assertEqual(self.read()['available_kib'], 12 * 1024)

    def test_namespaced_root_and_disabled_swap_are_honored(self):
        self.write(self.proc / 'self/cgroup', '0::/\n')
        self.write(self.group / 'memory.max', 1024**3)
        self.write(self.group / 'memory.current', 700 * 1024**2)
        self.write(self.group / 'memory.swap.max', 0)
        self.write(self.group / 'memory.swap.current', 0)
        self.write(self.group / 'memory.events', 'oom 3\noom_kill 2\n')
        self.assertEqual(self.read()['total_kib'], 1024 * 1024)
        self.assertEqual(self.read()['swap_free_kib'], 0)
        self.assertEqual(self.read()['oom_kill'], 2)

    def test_system_budget_keeps_vm_limit_but_ignores_panel_service_limit(self):
        self.write(self.proc / 'self/cgroup', '0::/system.slice/incus-panel.service\n')
        self.write(self.proc / '1/cgroup', '0::/init.scope\n')
        self.write(self.group / 'memory.max', 2048 * 1024**2)
        self.write(self.group / 'memory.current', 1024 * 1024**2)
        self.write(self.group / 'system.slice/incus-panel.service/memory.max', 128 * 1024**2)
        self.write(self.group / 'system.slice/incus-panel.service/memory.current', 32 * 1024**2)
        self.assertEqual(self.read()['available_kib'], 96 * 1024)
        self.assertEqual(memory_status(self.proc, self.group, system=True)['available_kib'], 1024 * 1024)

    def test_cgroup_v1_and_unlimited_sentinel(self):
        self.write(self.proc / 'self/cgroup', '5:memory:/vm\n')
        self.write(self.group / 'memory/memory.limit_in_bytes', 2**63 - 4096)
        target = self.group / 'memory/vm'
        self.write(target / 'memory.limit_in_bytes', 1024**3)
        self.write(target / 'memory.usage_in_bytes', 900 * 1024**2)
        self.write(target / 'memory.stat', f'total_inactive_file {50 * 1024**2}\n')
        self.assertEqual(self.read()['available_kib'], 174 * 1024)

    def test_host_available_is_still_an_upper_bound(self):
        self.write(self.proc / 'meminfo', 'MemTotal: 8388608 kB\nMemAvailable: 1024 kB\n')
        self.write(self.group / 'memory.max', 1024**3)
        self.write(self.group / 'memory.current', 0)
        self.assertEqual(self.read()['available_kib'], 1024)

    def test_missing_consumption_or_memavailable_is_not_reported_as_spare_memory(self):
        self.write(self.group / 'memory.max', 1024**3)
        with self.assertRaises(ValueError):
            self.read()
        self.write(self.proc / 'meminfo', 'MemTotal: 8388608 kB\nMemFree: 8000000 kB\n')
        with self.assertRaises(KeyError):
            self.read()
