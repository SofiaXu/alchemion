# Third-party scientific data notices

These notices apply to the verified M3 tables in `core/data`. Historical viewer/format assets remain separately inventoried in the project data-source ledger and are not the source of the M3 tables.

## periodictable 2.0.2

Author: Paul Kienzle. The upstream `core.py` and `mass.py` state “This program is public domain”; `covalent_radius.py` states “This program is in the public domain”. Fixed-tag sources, byte hashes and conversion records are in the generated `core/data/manifest.json` (also distributed as `SCIENTIFIC_DATA_MANIFEST.json`).

- Element identities: https://github.com/pkienzle/periodictable/blob/v2.0.2/periodictable/core.py
- Masses: https://github.com/pkienzle/periodictable/blob/v2.0.2/periodictable/mass.py ; CIAAW 2021 abridged standard atomic weights, Prohaska et al., DOI 10.1515/pac-2019-0603; AME2020 isotope masses, Wang et al., DOI 10.1088/1674-1137/abddaf.
- Covalent radii: https://github.com/pkienzle/periodictable/blob/v2.0.2/periodictable/covalent_radius.py ; Beatriz Cordero et al., Covalent radii revisited, Dalton Transactions (2008), 2832–2838, DOI 10.1039/B801115J.

The radius table uses C sp3 and Mn/Fe/Co low spin. Atomic numbers 97–118 have no radius and are not assigned a substitute. Reported zero uncertainties are retained and do not assert exact values. Mass records distinguish standard atomic weights from representative isotope masses; the latter carry the selected isotope mass number.

## spglib 2.6.0

Sources: https://github.com/spglib/spglib/tree/v2.6.0 ; Hall settings 1–530 from `get_spacegroup_type` and `get_symmetry_from_database`. Integer rotations are transposed to SDK column storage, translations are reduced to exact rational numbers after checking the round-trip error. Operation order is retained; no setting is guessed from an international number.

Original BSD 3-Clause license from https://github.com/spglib/spglib/blob/v2.6.0/COPYING:

```text
Copyright (c) 2024, Spglib team

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions
are met:

* Redistributions of source code must retain the above copyright
  notice, this list of conditions and the following disclaimer.
* Redistributions in binary form must reproduce the above copyright
  notice, this list of conditions and the following disclaimer in the
  documentation and/or other materials provided with the distribution.
* Neither the name of the <organization> nor the
  names of its contributors may be used to endorse or promote products
  derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
"AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL <COPYRIGHT
HOLDER> BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```
