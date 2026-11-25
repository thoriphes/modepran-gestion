# Material de partida

Todo llegó en **`Work.rar`** (2,6 GB, 2026-11-24), en el PC de Acción (Nacho).
El original lo tiene Miguel Ángel. **No subirlo a Nextcloud ni a git**: contiene datos personales y secretos.

| Fichero en el RAR | Qué es |
|---|---|
| `modepran-backup-2026-11-19.tar.gz` | App de **fichas de animales**: Laravel 9 completo de `modepran.jrfdev.com` (HestiaCP del desarrollador anterior), con `.git` (remoto Bitbucket `DarkDaler/modepran`), `.env`, `vendor/`, `storage/` (~2,6 GB de fotos y PDF) y `database/yisus_modepran.sql.gz` (MariaDB 11.4) |
| `App Citas/Modepran_Gestion_SIN_IA_2026-11-24.zip` | App de **gestión/coordinación** (Next.js) sin IA. Incluye `BETA-TURSO.md`, `TURSO-DESARROLLO.md`, `ACCESOS-DESARROLLO.md` |
| `App Citas/Modepran_Gestion_CON_IA_2026-11-24.zip` | La misma app + `Modepran-Recepcionista-IA` (agente de voz Gemini Live / LiveKit). Sin datos reales ni secretos |
| `App Citas/VERIFICACION-ZIP.json` | SHA-256 de los dos zips |

Para volver a analizarlos: extraer en una carpeta temporal **fuera de Nextcloud** y tratar el contenido
como no confiable (leerlo, no ejecutarlo). Lo que importa del contenido ya está en [feature-set.md](feature-set.md).

## Notas

- Los ficheros de la app de fichas incluyen **contratos de adopción/acogida con DNI y direcciones**:
  tratarlos como datos personales (RGPD) en la migración.
- La beta de Gestión (Turso + R2) solo tiene citas de prueba: **no se migra** (Nacho, 2026-11-25).
