"""Coleta Linux /proc, somente leitura. Não inicia nem altera workloads."""
import argparse
import csv
import os
from pathlib import Path
import time


def sample(pid):
    status = Path(f"/proc/{pid}/status").read_text()
    rss = next(int(line.split()[1]) for line in status.splitlines() if line.startswith("VmRSS:"))
    stat = Path(f"/proc/{pid}/stat").read_text().rsplit(")", 1)[1].split()
    ticks = int(stat[11]) + int(stat[12])
    return {"timestamp": time.time(), "pid": pid, "rss_kib": rss, "cpu_seconds": ticks / os.sysconf("SC_CLK_TCK")}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pid",type=int)
    parser.add_argument("--samples",type=int,default=30)
    parser.add_argument("--interval",type=float,default=2)
    parser.add_argument("--output",default="artifacts/measure.csv")
    args=parser.parse_args()
    if os.name!="posix" or not Path("/proc").exists():
        parser.error("Coleta requer Linux com /proc. Não produz resultados simulados.")
    if args.samples<2 or args.interval<=0:
        parser.error("Use pelo menos duas amostras e intervalo positivo.")
    path=Path(args.output)
    path.parent.mkdir(parents=True,exist_ok=True)
    with path.open("w",newline="",encoding="utf-8") as stream:
        writer=csv.DictWriter(stream,fieldnames=["timestamp","pid","rss_kib","cpu_seconds"])
        writer.writeheader()
        for index in range(args.samples):
            writer.writerow(sample(args.pid))
            stream.flush()
            if index+1<args.samples:time.sleep(args.interval)


if __name__=="__main__":main()
