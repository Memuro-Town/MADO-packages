#!/bin/sh
set -eu
# Dockerの無制限FD設定をValgrindが扱える値にする。
ulimit -n 1024
export DEBIAN_FRONTEND=noninteractive
mkdir -p /out /build
sed -i 's|http://|https://|g; s/^Types: deb$/Types: deb deb-src/' /etc/apt/sources.list.d/*
apt-get update -o APT::Update::Error-Mode=any
apt-get install -y --no-install-recommends ca-certificates build-essential devscripts patch valgrind libxml2-utils libxml2-dev
apt-get build-dep -y --no-install-recommends "libxml2=${LIBXML2_VERSION}"
cd /build
apt-get source "libxml2=${LIBXML2_VERSION}"
src_dir=$(find /build -mindepth 1 -maxdepth 1 -type d -name 'libxml2-*' -print -quit)
cd "$src_dir"
printf '%s  %s\n' 6c2b8a7b6fa470efcb1854e5c73bd7e1ae1663d8b111e27ce9232bbc1fe44f54 /security/libxml2/CVE-2026-6653.patch | sha256sum -c -
(cd /security/libxml2/backports && sha256sum -c SHA256SUMS)
g++ -g -O0 -std=c++11 /security/libxml2/poc/libxml2_xml_read_memory_fuzzer.cc /security/libxml2/poc/main_harness.cc -I/usr/include/libxml2 -lxml2 -lz -lm -llzma -o /out/xml-poc
cc /security/libxml2/tests/xinclude-options-test.c $(pkg-config --cflags --libs libxml-2.0) -o /out/xinclude-options-test
mkdir -p /out/dict-before
cp "$src_dir/dict.c" /out/dict-before/dict.c
before_reproduced=0
for input in poc/poc.xml min1.xml; do
  set +e
  timeout 60 valgrind --error-exitcode=86 --exit-on-first-error=yes --log-file="/out/before-$(basename "$input").valgrind" /out/xml-poc "/security/libxml2/$input"
  result=$?
  set -e
  if [ "$result" -eq 86 ]; then before_reproduced=1; else test "$result" -eq 0; fi
done
test "$before_reproduced" -eq 1
set +e
ulimit -c 0
/out/xinclude-options-test > /out/before-xinclude-options.log 2>&1
xinclude_result=$?
set -e
test "$xinclude_result" -ne 0
grep -q 'missing==0' /out/before-xinclude-options.log
patch --batch --fuzz=0 -p1 < /security/libxml2/CVE-2026-6653.patch
for patch_file in /security/libxml2/backports/*.patch; do
  patch --batch --fuzz=0 -p1 < "$patch_file"
done
sed -n '/xmlURIEscapeStr(/,/len += 20/p' "$src_dir/uri.c" | grep -Eq 'len == 0|len <= 0|!\(len > 0\)'
DEBFULLNAME='Local Security Maintenance' DEBEMAIL='security@localhost' dch --newversion "${LIBXML2_VERSION}+mado2" --distribution trixie 'Backport CVE-2026-86138, CVE-2026-86140, CVE-2026-86142, CVE-2026-86143, CVE-2026-86144; retain verified CVE-2026-86139 guard and CVE-2026-6653.'
DEB_BUILD_OPTIONS=parallel=2 dpkg-buildpackage -b -uc -us -j2 > /out/debian-build.log 2>&1 || { tail -120 /out/debian-build.log; exit 1; }
cc -I/out/dict-before -I"$src_dir/builddir/main" -I"$src_dir" -I"$src_dir/include" /security/libxml2/tests/dict-overflow-test.c -lxml2 -lpthread -o /out/dict-overflow-before
set +e
valgrind --error-exitcode=86 --exit-on-first-error=yes --log-file=/out/before-dict-overflow.valgrind /out/dict-overflow-before
dict_result=$?
set -e
test "$dict_result" -eq 86
cc -I"$src_dir/builddir/main" -I"$src_dir" -I"$src_dir/include" /security/libxml2/tests/dict-overflow-test.c -lxml2 -lpthread -o /out/dict-overflow-test
valgrind --error-exitcode=86 --log-file=/out/patched-dict-overflow.valgrind /out/dict-overflow-test
arch=$(dpkg --print-architecture)
libdir=$(pkg-config --variable=libdir libxml-2.0)
libxml="$libdir/libxml2.so.2"
nm -D --defined-only "$libxml" | awk '{print $2,$3}' | sort > /out/abi-before.txt
readelf -d "$libxml" | grep SONAME > /out/soname-before.txt
cp "/build/libxml2_${LIBXML2_VERSION}+mado2_${arch}.deb" /out/libxml2-fixed.deb
dpkg -i /build/libxml2_*+mado2_${arch}.deb /build/libxml2-dev_*+mado2_${arch}.deb /build/libxml2-utils_*+mado2_${arch}.deb
nm -D --defined-only "$libxml" | awk '{print $2,$3}' | sort > /out/abi-after.txt
readelf -d "$libxml" | grep SONAME > /out/soname-after.txt
diff -u /out/abi-before.txt /out/abi-after.txt
diff -u /out/soname-before.txt /out/soname-after.txt
for input in poc/poc.xml min1.xml; do
  timeout 60 valgrind --error-exitcode=86 --exit-on-first-error=yes --log-file="/out/after-$(basename "$input").valgrind" /out/xml-poc "/security/libxml2/$input"
done
valgrind --error-exitcode=86 --log-file=/out/after-dict-overflow.valgrind /out/dict-overflow-test
/out/xinclude-options-test
dpkg-query -W libxml2 > /out/package-version.txt
sha256sum /out/libxml2-fixed.deb > /out/SHA256SUMS
printf '%s\n' 'CVE-2026-6653 and CVE-2026-86138/86140/86142/86143/86144 backports passed; CVE-2026-86139 guard retained; ABI unchanged.' | tee /out/regression-result.txt
