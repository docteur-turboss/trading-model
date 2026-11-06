"""Fail if a .github/workflows/*.yml file is not valid YAML (deploy.yml once broke unseen)."""
import glob, sys, yaml

bad = 0
for f in sorted(glob.glob(".github/workflows/*.yml")):
    try:
        with open(f, encoding="utf-8") as h:
            yaml.safe_load(h)
        print("ok  ", f)
    except yaml.YAMLError as e:
        bad = 1
        print("FAIL", f, e)
sys.exit(bad)
