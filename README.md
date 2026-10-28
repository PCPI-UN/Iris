# 🚀 PCPI Backend · Sistema IRIS V3

Documentación técnica de arquitectura, instalación local, configuración y despliegue del backend de IRIS V3.

---

## 🗂️ Índice

1. [🏗️ Arquitectura y Microservicios](#1-️-arquitectura-y-microservicios)
2. [📋 Requisitos Previos](#2--requisitos-previos)
3. [🔐 Configuración de Variables de Entorno](#3--configuración-de-variables-de-entorno)
4. [⚡ Instalación y Ejecución en Desarrollo](#4-️-instalación-y-ejecución-en-desarrollo)
5. [💻 Desarrollo Local Híbrido](#5--desarrollo-local-híbrido)
6. [🗄️ Bases de Datos, Migraciones y Seeds](#6-️-bases-de-datos-migraciones-y-seeds)
7. [🚢 Procedimiento de Despliegue en Producción](#7--procedimiento-de-despliegue-en-producción)
8. [🌐 Servicios Externos e Integraciones](#8--servicios-externos-e-integraciones)
9. [🛠️ Comandos Útiles y Resolución de Problemas](#9-️-comandos-útiles-y-resolución-de-problemas)

---

## 1. 🏗️ Arquitectura y Microservicios

El backend de IRIS está diseñado bajo una arquitectura orientada a microservicios. Cuenta con una puerta de enlace HTTP (API Gateway) que recibe las solicitudes de los clientes y las distribuye hacia microservicios especializados mediante gRPC.

### 🗺️ Mapa de Servicios y Puertos

| Servicio | Tipo | Puerto de Red | Protocolo | Base de Datos Asociada |
| :--- | :--- | :--- | :--- | :--- |
| **Gateway** | HTTP / REST | `3000` | HTTP / JSON | No tiene (usa Redis) |
| **Auth Service** | Microservicio | `50051` | gRPC | `auth_service` |
| **Evaluation Service** | Microservicio | `50052` | gRPC | `evaluation_service` |
| **Event Service** | Microservicio | `50053` | gRPC | `event_service` |
| **Invitation Service** | Microservicio | `50054` | gRPC | `invitation_service` |
| **Project Service** | Microservicio | `50055` | gRPC | `project_service` |
| **Notification Service** | Microservicio | `50056` | gRPC | No tiene (Azure ACS) |
| **PostgreSQL** | Base de Datos | `5432` | TCP / PostgreSQL | Contiene las 5 bases de datos |
| **Redis** | Caché / Sesiones | `6379` | TCP / Redis | En memoria con persistencia |

### 📚 Documentación de API y Contratos

- **Swagger / OpenAPI (Gateway):** Disponible en entorno local en [http://localhost:3000/api/docs](http://localhost:3000/api/docs).
- **Contratos gRPC:** Los contratos de comunicación entre servicios están definidos en archivos Protocol Buffers bajo el directorio `libs/common/src/protos/`.
- **Código generado TypeScript:** Los archivos TypeScript resultantes se generan automáticamente en `libs/common/src/generated/`.

---

## 2. 📋 Requisitos Previos

Para ejecutar y colaborar en el backend se requiere:

- **Docker:** Versión 24.0 o superior con Docker Compose v2.
- **Node.js:** Versión 18.x o 20.x LTS.
- **pnpm:** Versión 8.x o 9.x (`npm install -g pnpm`).
- **OpenSSL:** Para la generación de llaves criptográficas RSA para los tokens JWT.
- **GNU Make:** Opcional pero recomendado para utilizar los accesos rápidos definidos en el `Makefile`.

---

## 3. 🔐 Configuración de Variables de Entorno

Toda la configuración del sistema se gestiona mediante un archivo `.env` en la raíz del directorio `backend/`. 

Para iniciar la configuración, copie la plantilla de ejemplo:

```bash
cp .env.example .env
```

### 📄 Documentación de Variables (Sin Secretos)

#### 👤 Cuentas Iniciales (Seed)
- `SEED_ADMIN_EMAIL`: Correo electrónico para el usuario administrador inicial (ej. `admin@iris.local`).
- `SEED_ADMIN_PASSWORD`: Contraseña del usuario administrador en desarrollo.
- `SEED_TEST_USER_PASSWORD`: Contraseña para cuentas generadas en entornos de prueba.

#### 🗄️ Bases de Datos (PostgreSQL)
El contenedor oficial corre en el puerto `5432` y ejecuta el script de inicialización que aprovisiona usuarios y bases aisladas para cada microservicio.
- `POSTGRES_PASSWORD`: Contraseña del superusuario `postgres`.
- `AUTH_DB_PASSWORD`: Contraseña del usuario `auth_user` para la base `auth_service`.
- `EVALUATION_DB_PASSWORD`: Contraseña del usuario `evaluation_user` para `evaluation_service`.
- `EVENT_DB_PASSWORD`: Contraseña del usuario `event_user` para `event_service`.
- `INVITATION_DB_PASSWORD`: Contraseña del usuario `invitation_user` para `invitation_service`.
- `PROJECT_DB_PASSWORD`: Contraseña del usuario `project_user` para `project_service`.

> [!NOTE]
> En desarrollo, la cadena de conexión local sigue el formato:
> `postgresql://<usuario>:<contraseña>@localhost:5432/<nombre_bd>`

#### ⚡ Caché (Redis)
- `REDIS_PASSWORD`: Contraseña requerida para conectarse a la instancia de Redis.

#### 🔑 Seguridad y Tokens JWT (Asimétrico RS256)
El servicio de autenticación utiliza criptografía asimétrica (RS256) con pares de llaves pública/privada independientes para tokens de acceso y tokens de refresco.

Para generar las llaves necesarias en formato PEM de una sola línea:

```bash
# Llaves para Access Token
openssl genrsa -out access_private.key 2048
openssl rsa -in access_private.key -pubout -out access_public.key

# Llaves para Refresh Token
openssl genrsa -out refresh_private.key 2048
openssl rsa -in refresh_private.key -pubout -out refresh_public.key
```

El código de `auth-service` y `gateway` decodifica las llaves explícitamente desde **Base64** (`Buffer.from(key, 'base64').toString('ascii')`). Por ello, las llaves PEM deben codificarse en Base64 en una sola línea antes de colocarse en el `.env`.

Para codificar cada llave generada en Base64:

```bash
# En Linux:
base64 -w 0 access_private.key
base64 -w 0 access_public.key
base64 -w 0 refresh_private.key
base64 -w 0 refresh_public.key

# En macOS:
base64 -i access_private.key | tr -d '\n'
```

Variables a configurar en `.env`:
- `JWT_PRIVATE_KEY`: Llave privada RSA para firma del Access Token.
- `JWT_PUBLIC_KEY`: Llave pública RSA para verificación del Access Token.
- `JWT_REFRESH_PRIVATE_KEY`: Llave privada RSA para el Refresh Token.
- `JWT_REFRESH_PUBLIC_KEY`: Llave pública RSA para el Refresh Token.
- `JWT_ACCESS_TOKEN_EXPIRATION`: Tiempo de validez del Access Token (ej. `15m`).
- `JWT_REFRESH_TOKEN_EXPIRATION`: Tiempo de validez del Refresh Token (ej. `7d`).
- `JWT_REFRESH_TOKEN_EXPIRATION_DAYS`: Número entero de días para refresco (ej. `7`).

#### 🔗 Enlaces de Microservicios (Red Interna Docker)
- `AUTH_SERVICE_URL`: `auth-service:50051`
- `EVALUATION_SERVICE_URL`: `evaluation-service:50052`
- `EVENT_SERVICE_URL`: `event-service:50053`
- `INVITATION_SERVICE_URL`: `invitation-service:50054`
- `PROJECT_SERVICE_URL`: `project-service:50055`
- `NOTIFICATION_SERVICE_URL`: `notification-service:50056`

#### ⚙️ Configuración de la Aplicación y CORS
- `NODE_ENV`: `development` para desarrollo local, `production` para despliegues.
- `GRPC_HOST`: `0.0.0.0` para permitir escucha en red del contenedor.
- `FRONTEND_URL`: URL base del cliente web (ej. `http://localhost:3000` o `http://localhost:3001`).
- `ALLOWED_ORIGINS`: Lista de orígenes permitidos para CORS separada por comas.
- `ALLOW_INSECURE_COOKIES`: Configurar en `true` para desarrollo local sin HTTPS. En producción debe ser `false`.
- `ALLOW_CROSS_ORIGIN_COOKIES`: Permitir cookies cruzadas si el frontend y backend están en dominios o puertos distintos.
- `PASSWORD_RESET_TOKEN_EXPIRY_MINUTES`: Minutos de validez para el token de recuperación de contraseña (ej. `15`).
- `ACCOUNT_SETUP_TOKEN_EXPIRY_SECONDS`: Segundos de validez para la invitación de activación de cuenta (ej. `172800`).
- `COOKIE_DOMAIN`: Dominio de la cookie (dejar vacío en desarrollo local).

#### ✉️ Servicio de Correo (Azure Communication Services)
- `ACS_CONNECTION_STRING`: Cadena de conexión provista por Azure Communication Services.
- `ACS_SENDER_ADDRESS`: Dirección de envío autorizada en Azure (ej. `DoNotReply@...azurecomm.net`).

#### 📦 Almacenamiento de Archivos (Azure Blob Storage)
El API Gateway inicializa el cliente del SDK de Azure Blob en su constructor (`AzureBlobUploadService`) para la subida de documentos y entregables de proyectos.
- `AZURE_BLOB_SAS_URL`: SAS URL con permisos de contenedor. En **desarrollo local** se utiliza una URI dummy sintácticamente válida (`https://dummy.blob.core.windows.net/dummy?dummy`) para permitir que el Gateway levante sin credenciales reales de Azure.
- `AZURE_ACCOUNT_NAME`: Nombre de la cuenta de almacenamiento (usar `dummy` en local).
- `AZURE_ACCOUNT_KEY`: Llave de la cuenta de almacenamiento (usar `dummy` en local).
- `AZURE_CONTAINER`: Nombre del contenedor (usar `dummy` en local).

> [!NOTE]
> El SDK de Azure valida estrictamente que la URL tenga formato válido al arrancar. Nunca dejes la variable vacía ni con corchetes literales como `<account-name>`, ya que Node.js arrojará `ERR_INVALID_URL` y detendrá el contenedor del Gateway.

---

## 4. ⚡ Instalación y Ejecución en Desarrollo

### 📦 Paso 1: Instalación de Dependencias Locales

Instale las dependencias del monorepo con pnpm:

```bash
pnpm install
```

### 📜 Paso 2: Generar Contratos gRPC

Antes de compilar o arrancar los servicios por primera vez, compile los archivos `.proto`:

```bash
make proto-gen
# O directamente:
pnpm run proto:generate
```

### 🐳 Paso 3: Levantar el Entorno con Docker

El archivo de orquestación para desarrollo es `docker-compose.dev.yml`.

#### 🛠️ Usando Makefile (Recomendado)

```bash
# Iniciar todos los servicios en segundo plano con hot-reload
make dev-up

# Ver el registro de logs de todos los servicios
make dev-logs

# Detener los servicios
make dev-down
```

#### 🐳 Usando Docker Compose Directamente

```bash
# Iniciar servicios cargando las variables de entorno
docker compose -f docker-compose.dev.yml --env-file .env up -d

# Consultar logs
docker compose -f docker-compose.dev.yml --env-file .env logs -f

# Detener contenedores
docker compose -f docker-compose.dev.yml --env-file .env down
```

### 🔄 Comportamiento del Arranque en Desarrollo

Al ejecutar el entorno de desarrollo, cada contenedor realiza automáticamente las siguientes tareas:
1. ✅ Asegura la generación de los contratos TypeScript desde los archivos proto.
2. ✅ Genera los clientes de Prisma para cada esquema.
3. ✅ Aplica las migraciones correspondientes en la base de datos PostgreSQL.
4. ✅ En `auth-service`, ejecuta el seed inicial para crear roles y el usuario administrador.
5. ✅ Inicia el servidor de NestJS con observador de cambios en vivo (`--watch`).

---

## 5. 💻 Desarrollo Local Híbrido

Si necesita trabajar activamente en un microservicio en particular y prefiere ejecutarlo directamente en su terminal sin la capa de Docker para depuración interactiva:

1. **Inicie únicamente la infraestructura base en Docker:**
   ```bash
   docker compose -f docker-compose.dev.yml up postgres redis -d
   ```

2. **Asegure los contratos gRPC y el cliente de Prisma:**
   ```bash
   pnpm run proto:generate
   pnpm exec prisma generate --schema=./apps/<nombre-servicio>/prisma/schema.prisma
   ```

3. **Inicie el microservicio deseado con watch mode:**
   ```bash
   # Ejemplo para el servicio de eventos:
   pnpm exec nest start event-service --watch

   # Ejemplo para el API Gateway:
   pnpm exec nest start gateway --watch
   ```

---

## 6. 🗄️ Bases de Datos, Migraciones y Seeds

### 🔌 Aprovisionamiento Inicial

El backend utiliza una sola instancia de PostgreSQL 16 en el puerto `5432`. El script `docker/postgres-init.sh` crea cinco bases de datos independientes con permisos restringidos por usuario:
- `auth_service` (propietario: `auth_user`)
- `evaluation_service` (propietario: `evaluation_user`)
- `event_service` (propietario: `event_user`)
- `invitation_service` (propietario: `invitation_user`)
- `project_service` (propietario: `project_user`)

### 🔄 Estrategia de Migraciones con Prisma

Cada microservicio gestiona su propio esquema de base de datos bajo `apps/<servicio>/prisma/schema.prisma`.

- **Auth Service:** Utiliza migraciones formales versionadas:
  ```bash
  pnpm exec prisma migrate deploy --schema=./apps/auth-service/prisma/schema.prisma
  ```
  Para crear una nueva migración al modificar el esquema:
  ```bash
  pnpm exec prisma migrate dev --name <nombre_cambio> --schema=./apps/auth-service/prisma/schema.prisma
  ```

- **Servicios de Event, Evaluation, Invitation y Project:** Sincronizan su esquema mediante push:
  ```bash
  pnpm exec prisma db push --schema=./apps/<servicio>/prisma/schema.prisma
  ```

### 🌱 Datos Iniciales (Seed)

El seed de la aplicación está centralizado en `auth-service` para definir los roles del sistema (`Admin`, `Juror`, `Participant`, etc.), los permisos asociados y el usuario administrador inicial:

```bash
pnpm exec prisma db seed
```

El script se encuentra en `apps/auth-service/prisma/seed.ts` y toma las credenciales definidas en `SEED_ADMIN_EMAIL` y `SEED_ADMIN_PASSWORD`.

---

## 7. 🚢 Procedimiento de Despliegue en Producción

El despliegue de producción utiliza el archivo `docker-compose.yml`.

### ✨ Características de Producción
- Imágenes optimizadas con compilación multi-etapa (multi-stage builds).
- Las bases de datos están enlazadas exclusivamente a la interfaz local (`127.0.0.1:5432`) o a la red privada `dokploy-network`.
- **Contenedores de migración efímeros:** Antes de iniciar los servicios, contenedores dedicados (`auth-migration`, `evaluation-migration`, `event-migration`, `invitation-migration`, `project-migration`) ejecutan las migraciones y finalizan de forma controlada (`restart: "no"`).

### 🚀 Pasos de Despliegue

1. **Configurar el entorno:** Cree el archivo `.env` con las contraseñas definitivas de producción, llaves RSA y cadenas de conexión de Azure. Verifique que `NODE_ENV=production` y `ALLOW_INSECURE_COOKIES=false`.

2. **Ejecutar el despliegue:**
   ```bash
   make prod-up
   # O directamente:
   docker compose up -d
   ```

3. **Verificar el estado del despliegue:**
   ```bash
   docker compose ps
   docker compose logs -f gateway
   ```

4. **Detener servicios de producción:**
   ```bash
   make prod-down
   # O directamente:
   docker compose down
   ```

---

## 8. 🌐 Servicios Externos e Integraciones

### ✉️ Azure Communication Services (ACS)
- Utilizado por `notification-service` para el envío transaccional de notificaciones por correo electrónico (activación de cuentas, recuperación de credenciales, invitaciones de jurados y comunicados de proyectos).
- Requiere un recurso válido configurado en Azure con dominio de envío verificado.

### 📦 Azure Blob Storage
- Utilizado por el API Gateway (`AzureBlobUploadService`) para la persistencia de archivos, documentos y entregables adjuntos a proyectos.
- En desarrollo local, se utiliza una configuración dummy (`https://dummy.blob.core.windows.net/dummy?dummy`) para permitir el arranque sin llamadas a la nube.

### ⚡ Redis
- Instancia en memoria utilizada por el API Gateway.
- Se encarga del almacenamiento en caché de consultas frecuentes y el control de invalidación de caché por etiquetas y eventos.

---

## 9. 🛠️ Comandos Útiles y Resolución de Problemas

### 📋 Resumen de Comandos Make

```bash
make help          # Muestra todos los comandos disponibles
make dev-up        # Inicia entorno de desarrollo con .env
make dev-down      # Detiene contenedores de desarrollo
make dev-build     # Compila imágenes de desarrollo
make dev-rebuild   # Reconstruye imágenes de desarrollo sin caché
make dev-logs      # Muestra logs en tiempo real
make prod-up       # Despliega contenedores en modo producción
make prod-down     # Detiene contenedores de producción
make prod-logs     # Muestra logs de producción
make proto-gen     # Compila los archivos proto a TypeScript
make clean         # Elimina contenedores y volúmenes huérfanos
make clean-all     # Limpieza profunda de contenedores, volúmenes e imágenes
```

### 🔍 Problemas Frecuentes

#### Error al resolver contratos gRPC o módulos no encontrados en `libs/common/src/generated`
Ejecute la generación manual de contratos:
```bash
make proto-gen
```

#### Conflicto de puerto 5432 con una instancia local de PostgreSQL
Si tiene un servicio local de PostgreSQL activo en su sistema operativo:
```bash
# En Linux (systemd):
sudo systemctl stop postgresql
```
O bien, ajuste la asignación de puerto externo en `docker-compose.dev.yml`.

#### Reinicio limpio de volúmenes de desarrollo
Para restablecer completamente las bases de datos y comenzar desde cero:
```bash
docker compose -f docker-compose.dev.yml down -v
make dev-up
```
