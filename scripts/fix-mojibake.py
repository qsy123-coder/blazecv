import sys

path = sys.argv[1]
with open(path, encoding="utf-8-sig") as f:
    s = f.read()
try:
    b = s.encode("gb18030")
except UnicodeEncodeError as e:
    print("ENCFAIL", e)
    sys.exit(1)
try:
    r = b.decode("utf-8")
except UnicodeDecodeError as e:
    print("DECFAIL", e)
    sys.exit(1)
with open(path + ".fixed", "w", encoding="utf-8", newline="\n") as f:
    f.write(r)
print("OK", len(s), len(r), "技能" in r, "电话" in r, "页边距" in r)
