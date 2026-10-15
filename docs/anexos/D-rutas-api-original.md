## Anexo D — Rutas API del ORIGINAL y permiso que comprueban (extraído automáticamente)

| Ruta | Métodos | Permiso comprobado en el código original | Líneas |
|---|---|---|---|
| `/api/admin/ajustes` | GET,POST | solo administrador | 71 |
| `/api/admin/backup` | GET,POST | solo administrador | 213 |
| `/api/admin/catalogos` | GET,POST,DELETE,PUT | solo administrador | 267 |
| `/api/admin/db-cleanup` | GET,POST | solo administrador | 220 |
| `/api/admin/tiendas` | POST,DELETE,PUT | solo administrador | 102 |
| `/api/admin/usuarios` | POST,PUT,DELETE | solo administrador | 192 |
| `/api/admin/usuarios/rol` | PUT | solo administrador | 47 |
| `/api/buscar` | GET | sesión iniciada (sin comprobación de rol) | 78 |
| `/api/clientes` | POST,PUT,DELETE | no invitado | 223 |
| `/api/clientes/buscar` | GET | sesión iniciada (sin comprobación de rol) | 38 |
| `/api/clientes/import` | POST | no invitado | 141 |
| `/api/clientes/verificar-existencia` | POST | sesión iniciada (sin comprobación de rol) | 58 |
| `/api/comisiones/liquidar` | GET,POST,PUT | solo administrador | 1029 |
| `/api/comisiones/planes` | GET,POST,PUT,DELETE | solo administrador | 729 |
| `/api/comisiones/verificar` | GET | sesión iniciada (sin comprobación de rol) | 152 |
| `/api/expedientes` | GET,POST,PUT,DELETE | no invitado | 447 |
| `/api/expedientes/import` | POST | no invitado | 318 |
| `/api/expedientes/importar-excel/procesar` | POST | no invitado | 260 |
| `/api/expedientes/importar-excel/verificar` | POST | no invitado | 119 |
| `/api/expedientes/simular-comision` | POST | sesión iniciada (sin comprobación de rol) | 850 |
| `/api/importaciones` | GET,DELETE | no invitado | 88 |
| `/api/perfil` | GET,POST | sesión iniciada (sin comprobación de rol) | 109 |
| `/api/usuario/tienda-predeterminada` | POST | sesión iniciada (sin comprobación de rol) | 39 |

> Nota: la comprobación se detecta **a nivel de archivo**; en `/api/comisiones/planes` el control de administrador está en un asistente usado por POST/PUT/DELETE, y el GET de lectura exige solo sesión [I]. Todas las rutas del original exigen sesión de Clerk (`auth()`), salvo que se indique lo contrario.

---
