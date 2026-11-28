"""Prepara as fontes métricas (Carlito, Caladea, Arimo, Tinos, Cousine) para o PDF.

O fontkit usado pelo pdf-lib não lê corretamente estas fontes do Google Fonts
(subset truncado e erro ao ler glifos). Regravadas pelo fontTools, só com os
alfabetos latino, grego e cirílico e símbolos comuns, sem hinting e sem tabelas
de layout, elas embutem sem erro (inteiras) e ficam com ~110-150 KB cada.

Uso: python scripts/docfonts.py <pasta-origem> <pasta-destino>  (chamado por vendor.mjs)
Requer: pip install fonttools
"""
import sys, os, glob
from fontTools import subset

UNICODES = ('U+0000-024F,U+0250-02FF,U+0300-036F,U+0370-03FF,U+0400-052F,U+1E00-1EFF,U+2000-206F,'
            'U+20A0-20CF,U+2100-214F,U+2150-218F,U+2190-21FF,U+2200-22FF,U+2300-23FF,U+2500-25FF,'
            'U+2600-26FF,U+2700-27BF,U+FB00-FB06,U+FFFD')

src, dst = sys.argv[1], sys.argv[2]
os.makedirs(dst, exist_ok=True)
for f in sorted(glob.glob(os.path.join(src, '*.ttf'))):
    out = os.path.join(dst, os.path.basename(f))
    subset.main([f, '--unicodes=' + UNICODES, '--no-hinting', '--drop-tables+=GSUB,GPOS,GDEF,STAT,kern,BASE,JSTF,MATH',
                 '--layout-features=', '--name-IDs=*', '--output-file=' + out])
    print(os.path.basename(out), os.path.getsize(out))
