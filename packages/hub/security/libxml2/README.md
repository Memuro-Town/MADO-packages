# PostgreSQL image: libxml2 security backport

Debian Trixie currently packages libxml2 as `2.12.7+dfsg+really2.9.14`: it is based on upstream 2.9.14 and remains affected by several issues fixed upstream in 2.15.4. The PostgreSQL image keeps Debian's supported package base and builds a local Debian package from its exact source version with reviewed upstream security fixes.

`build.sh` verifies the CVE-2026-6653 patch digest and five additional patch digests before applying them. It also verifies Debian's existing non-positive length guard in `xmlURIEscapeStr` for CVE-2026-86139. Before and after patching, the build runs the public CVE-2026-6653 PoCs and focused dictionary/XInclude regressions. It then builds and installs the Debian packages, checks that exported symbols and the library SONAME are unchanged, runs the patched regressions under Valgrind, and runs the upstream test suite.

The resulting package version ends in `+mado2`. The OpenVEX statement in `openvex.json` applies only to that exact libxml2 package on Debian 13.7 amd64. Keep the raw Trivy report as well as a VEX-aware report; the Debian package metadata does not know about these local backports. Other findings in the image are not suppressed by this VEX file.

To rebuild and inspect the reports from this directory's parent (`packages/hub`):

```sh
docker build --pull -f Dockerfile.postgres -t mado-hub-postgres:verify .
trivy image --scanners vuln --format json --output postgres-raw.json mado-hub-postgres:verify
trivy image --scanners vuln --vex security/libxml2/openvex.json --format json --output postgres-vex.json mado-hub-postgres:verify
```

This local backport is a maintenance measure until Debian publishes fixed Trixie packages. Rebase on the official fixed package and remove the local patches and VEX statements when it becomes available. The package build and runtime checks are exercised on Linux amd64.

## Verification snapshot (2026-11-02)

The PR candidate built and started as PostgreSQL 16; the XPath smoke query returned `{ok}`, the `gosu` check succeeded, and pgAudit loaded through `shared_preload_libraries` and created its extension. The application image had no Trivy findings. The PostgreSQL image's raw Trivy scan reported 1 Critical and 56 High records; after applying this VEX file, 47 High records across 9 CVEs remained. These residuals were in util-linux, ncurses, Perl, libacl, and SQLite packages: CVE-2026-76642, CVE-2026-78408/78409/78410, CVE-2025-69720, CVE-2026-9538, CVE-2026-54369, CVE-2026-119373, and CVE-2026-119586. The PR does not claim these findings are fixed; rescan after Debian publishes updated packages and before release. Full JSON reports are retained with the review artifacts outside the repository.
