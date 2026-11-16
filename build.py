#!/usr/bin/env python3
"""Monta o index.html único (padrão dos painéis Login Serv) a partir de src/."""
import datetime, pathlib
R = pathlib.Path(__file__).parent; S = R / 'src'
logo = (S / 'logo.datauri').read_text().strip()
build = datetime.datetime.now().strftime('%Y-%m-%d-%H%M')
css = ''.join((S / f).read_text(encoding='utf8') for f in ['base.css', 'extra.css', 'frota.css'])
body = (S / 'body.html').read_text(encoding='utf8').replace('{{LOGO}}', logo).replace('{{BUILD}}', build)
demo = (S / 'demo.json').read_text(encoding='utf8').strip()
js = 'var DEMO_BASE = "2026-11-16";\nvar DEMO_DATA = ' + demo + ';\n' + '\n'.join((S / f).read_text(encoding='utf8') for f in ['core.js', 'views.js', 'forms.js', 'agilesat.js'])
html = f'''<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Painel Frota — Login Serv</title>
<link rel="icon" href="{logo}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<script src="https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.7.1/firebase-auth-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.7.1/firebase-database-compat.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
<style>{css}</style>
</head>
<body>
{body}
<script>
{js}
</script>
</body>
</html>
'''
(R / 'index.html').write_text(html, encoding='utf8')
print('index.html', len(html), 'bytes, build', build)
