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

The browser modeling worker also loads a spglib 2.6.0 WebAssembly build on demand. The distributed `dist/spglib-notices` directory records the pinned source and compiler, binary hash, and the spglib and toolchain licences. The standalone demo includes these notices with its offline data sources.

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

## Unicode 16.0.0 case folding

CIF2 canonical caseless identifiers use C+F mappings from https://unicode.org/Public/16.0.0/ucd/CaseFolding.txt with NFD normalization. The converted table is included in the formats bundle. Original bytes, conversion and output hashes are recorded in dist/FORMAT_DATA_MANIFEST.json.

Original Unicode license from https://www.unicode.org/license.txt:

```text
UNICODE LICENSE V3

COPYRIGHT AND PERMISSION NOTICE

Copyright © 1991-2026 Unicode, Inc.

NOTICE TO USER: Carefully read the following legal agreement. BY
DOWNLOADING, INSTALLING, COPYING OR OTHERWISE USING DATA FILES, AND/OR
SOFTWARE, YOU UNEQUIVOCALLY ACCEPT, AND AGREE TO BE BOUND BY, ALL OF THE
TERMS AND CONDITIONS OF THIS AGREEMENT. IF YOU DO NOT AGREE, DO NOT
DOWNLOAD, INSTALL, COPY, DISTRIBUTE OR USE THE DATA FILES OR SOFTWARE.

Permission is hereby granted, free of charge, to any person obtaining a
copy of data files and any associated documentation (the "Data Files") or
software and any associated documentation (the "Software") to deal in the
Data Files or Software without restriction, including without limitation
the rights to use, copy, modify, merge, publish, distribute, and/or sell
copies of the Data Files or Software, and to permit persons to whom the
Data Files or Software are furnished to do so, provided that either (a)
this copyright and permission notice appear with all copies of the Data
Files or Software, or (b) this copyright and permission notice appear in
associated Documentation.

THE DATA FILES AND SOFTWARE ARE PROVIDED "AS IS", WITHOUT WARRANTY OF ANY
KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT OF
THIRD PARTY RIGHTS.

IN NO EVENT SHALL THE COPYRIGHT HOLDER OR HOLDERS INCLUDED IN THIS NOTICE
BE LIABLE FOR ANY CLAIM, OR ANY SPECIAL INDIRECT OR CONSEQUENTIAL DAMAGES,
OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS,
WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION,
ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THE DATA
FILES OR SOFTWARE.

Except as contained in this notice, the name of a copyright holder shall
not be used in advertising or otherwise to promote the sale, use or other
dealings in these Data Files or Software without prior written
authorization of the copyright holder.

```

## RDKit 2025.09.6 reference mass numbers

Only the reference isotope mass-number column is extracted from the fixed source https://raw.githubusercontent.com/rdkit/rdkit/Release_2025_09_6/Code/GraphMol/atomic_data.cpp for CTfile mass-difference decoding. This does not replace the scientific atomic-weight table or include the RDKit runtime. Original bytes and conversion output hashes are recorded in dist/FORMAT_DATA_MANIFEST.json.

Original license from https://raw.githubusercontent.com/rdkit/rdkit/Release_2025_09_6/license.txt:

```text
BSD 3-Clause License

Copyright (c) 2006-2015, Rational Discovery LLC, Greg Landrum, and Julie Penzotti and others
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its
   contributors may be used to endorse or promote products derived from
   this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

```

## M5 van der Waals display radii

mendeleev-data 1.1.0 (67e08702c5e9e8541d9944824b10edfb718d61e8), vdw_radius_alvarez: Alvarez 2013 (10.1039/C3DT50599E), noble-gas updates Vogt/Alvarez 2014 (10.1021/ic501364h; erratum 10.1021/ic502140y). pm values are converted to Angstrom; 24 missing entries remain absent. See VDW_DATA_MANIFEST.json for fixed sources, hashes and limitations. The display fallback is a visual parameter, never a covalent bonding radius.

MIT License

Copyright (c) 2024 Lukasz Mentel

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
