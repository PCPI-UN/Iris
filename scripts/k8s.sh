#!/usr/bin/env bash
set -euo pipefail

NAMESPACE="${NAMESPACE:-pcpi}"
SKIP_BUILD=false
LOCAL_ONLY=false
K3S_SSH_USER="${K3S_SSH_USER:-}"
PUBLIC_URL="${PUBLIC_URL:-}"
NODE_ENV="${NODE_ENV:-}"
LOG_APP=""
LOG_CONTAINER=""
LOG_TAIL="100"
LOG_FOLLOW=true
SECRETS_TEMPLATE=""
FORCE_INIT=false
AUTO_YES=false
SELECTED_SERVICES=()

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
K8S_DIR="$BACKEND_DIR/k8s"
SECRETS_FILE="$K8S_DIR/config/secrets.yaml"

BACKEND_SERVICES=("auth-service" "evaluation-service" "event-service" "invitation-service" "project-service" "notification-service" "gateway")
DB_SERVICES=()
if [[ -d "$K8S_DIR/databases" ]]; then
  for db_file in "$K8S_DIR/databases/"*-db.yaml; do
    [[ -e "$db_file" ]] || continue
    db_base="$(basename "$db_file" -db.yaml)"
    DB_SERVICES+=("${db_base}-service")
  done
fi
if (( ${#DB_SERVICES[@]} == 0 )); then
  DB_SERVICES=("auth-service" "evaluation-service" "event-service" "invitation-service" "project-service")
fi

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log_info()    { echo -e "${BLUE}  $1${NC}"; }
log_success() { echo -e "${GREEN}  $1${NC}"; }
log_warn()    { echo -e "${YELLOW}  $1${NC}"; }
log_error()   { echo -e "${RED}  $1${NC}"; }

SUDO_CMD=()
if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  SUDO_CMD=(sudo)
fi

KUBECTL_COMMAND=()
NEEDS_SUDO_FOR_KUBECTL=false

kubectl_local() {
  if command -v kubectl >/dev/null 2>&1; then
    KUBECONFIG=/dev/null kubectl "$@"
  elif command -v k3s >/dev/null 2>&1; then
    k3s kubectl --kubeconfig /dev/null "$@"
  else
    log_error "No se encontró 'k3s' ni 'kubectl' para validar o transformar manifiestos YAML."
    return 1
  fi
}

setup_k3s_kubectl() {
  if [[ -n "${KUBECONFIG:-}" && -r "$KUBECONFIG" ]]; then
    KUBECTL_COMMAND=(k3s kubectl --kubeconfig "$KUBECONFIG")
  elif [[ -r "$HOME/.kube/config" ]]; then
    KUBECTL_COMMAND=(k3s kubectl --kubeconfig "$HOME/.kube/config")
  elif [[ -r "/etc/rancher/k3s/k3s.yaml" ]]; then
    KUBECTL_COMMAND=(k3s kubectl --kubeconfig /etc/rancher/k3s/k3s.yaml)
  elif (( ${#SUDO_CMD[@]} > 0 )); then
    NEEDS_SUDO_FOR_KUBECTL=true
    KUBECTL_COMMAND=("${SUDO_CMD[@]}" k3s kubectl --kubeconfig /etc/rancher/k3s/k3s.yaml)
  else
    KUBECTL_COMMAND=(k3s kubectl --kubeconfig /etc/rancher/k3s/k3s.yaml)
  fi
}

require_cmd() {
  local cmd="$1"
  local hint="${2:-}"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    log_error "Dependencia requerida no encontrada: '$cmd'.${hint:+ $hint}"
    exit 1
  fi
}

preflight_checks() {
  local action="$1"

  case "$action" in
    init)
      require_cmd openssl
      require_cmd base64
      ;;
    check)
      if ! command -v k3s >/dev/null 2>&1 && ! command -v kubectl >/dev/null 2>&1; then
        log_error "Se requiere 'k3s' o 'kubectl' para validar los manifiestos."
        exit 1
      fi
      require_cmd openssl
      require_cmd base64
      ;;
    build)
      if ! command -v k3s >/dev/null 2>&1 && ! command -v kubectl >/dev/null 2>&1; then
        log_error "Se requiere 'k3s' o 'kubectl' para validar la configuración antes del build."
        exit 1
      fi
      require_cmd openssl
      require_cmd base64
      require_cmd docker "Instala Docker Engine para compilar imágenes."
      if ! docker info >/dev/null 2>&1; then
        log_error "El daemon de Docker no está corriendo o tu usuario no tiene permisos sobre él."
        exit 1
      fi
      ;;
    load)
      require_cmd k3s "Instala k3s en el servidor."
      require_cmd docker
      if ! docker info >/dev/null 2>&1; then
        log_error "El daemon de Docker no está corriendo o tu usuario no tiene permisos sobre él."
        exit 1
      fi
      if (( ${#SUDO_CMD[@]} > 0 )); then
        require_cmd sudo
      fi
      ;;
    up)
      require_cmd k3s "Instala k3s en el servidor."
      require_cmd openssl
      require_cmd base64
      if [[ "$SKIP_BUILD" == false ]]; then
        require_cmd docker "Instala Docker Engine para compilar imágenes."
      else
        require_cmd docker "Se requiere Docker para exportar imágenes locales hacia k3s."
      fi
      if ! docker info >/dev/null 2>&1; then
        log_error "El daemon de Docker no está corriendo o tu usuario no tiene permisos sobre él."
        exit 1
      fi
      if (( ${#SUDO_CMD[@]} > 0 )); then
        require_cmd sudo
      fi
      ;;
    deploy)
      require_cmd k3s "Instala k3s en el servidor."
      require_cmd openssl
      require_cmd base64
      if [[ "$NEEDS_SUDO_FOR_KUBECTL" == true ]]; then
        require_cmd sudo
      fi
      ;;
    migrate|status|logs|down)
      require_cmd k3s "Instala k3s en el servidor."
      if [[ "$NEEDS_SUDO_FOR_KUBECTL" == true ]]; then
        require_cmd sudo
      fi
      ;;
    prune)
      require_cmd k3s "Instala k3s en el servidor."
      require_cmd docker
      if (( ${#SUDO_CMD[@]} > 0 )); then
        require_cmd sudo
      fi
      ;;
  esac
}

configure_public_url() {
  PUBLIC_URL="${PUBLIC_URL:-http://localhost}"
  PUBLIC_URL="${PUBLIC_URL%/}"
  local origin_pattern='^https?://([A-Za-z0-9][A-Za-z0-9.-]*|\[[A-Fa-f0-9:]+\])(:([0-9]{1,5}))?$'
  if [[ ! "$PUBLIC_URL" =~ $origin_pattern ]]; then
    log_error "--public-url debe ser un origen HTTP/HTTPS sin ruta, usuario ni parámetros."
    return 1
  fi
  local port="${BASH_REMATCH[3]:-}"
  if [[ -n "$port" ]] && ((10#$port == 0 || 10#$port > 65535)); then
    log_error "El puerto de --public-url no es válido."
    return 1
  fi
}

deploy_ingress() {
  if [[ ! -f "$K8S_DIR/ingress.yaml" ]]; then
    return 0
  fi

  local public_host="${PUBLIC_URL#http://}"
  public_host="${public_host#https://}"
  if [[ "$public_host" != \[*\]* ]]; then
    public_host="${public_host%%:*}"
  else
    public_host="${public_host%%\]*}]"
  fi

  log_info "Desplegando Ingress (Host: $public_host)..."
  local ipv4_pattern='^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$'
  local http_paths='{"paths":[{"path":"/api/docs","pathType":"Prefix","backend":{"service":{"name":"gateway","port":{"number":3000}}}},{"path":"/","pathType":"Prefix","backend":{"service":{"name":"frontend","port":{"number":3000}}}}]}'

  if [[ "$public_host" == "localhost" || "$public_host" == "iris.local" ]]; then
    "${KUBECTL_COMMAND[@]}" apply -f "$K8S_DIR/ingress.yaml"
  elif [[ "$public_host" =~ $ipv4_pattern || "$public_host" == \[*\] ]]; then
    # Kubernetes Ingress no permite direcciones IP en el campo 'host', se usa regla comodín sin host
    kubectl_local patch --local --type merge -f "$K8S_DIR/ingress.yaml" \
      -p "{\"spec\":{\"rules\":[{\"http\":$http_paths}]}}" \
      -o yaml | "${KUBECTL_COMMAND[@]}" apply -f -
  else
    kubectl_local patch --local --type merge -f "$K8S_DIR/ingress.yaml" \
      -p "{\"spec\":{\"rules\":[{\"host\":\"$public_host\",\"http\":$http_paths},{\"host\":\"localhost\",\"http\":$http_paths}]}}" \
      -o yaml | "${KUBECTL_COMMAND[@]}" apply -f -
  fi
}

read_local_secret() {
  local value
  value=$(kubectl_local patch --local --type merge -f "$SECRETS_FILE" -p '{}' -o "jsonpath={.stringData.$1}")
  if [[ -n "$value" ]]; then
    printf '%s' "$value"
  else
    kubectl_local patch --local --type merge -f "$SECRETS_FILE" -p '{}' -o "jsonpath={.data.$1}" | base64 --decode
  fi
}

secret_is_configured() {
  local value
  value=$(read_local_secret "$1")
  [[ -n "$value" && "$value" != REPLACE_* && "$value" != your_* ]]
}

read_database_password() {
  read_local_secret "$1"
}

validate_database_passwords() {
  local service prefix key value index
  local keys=() passwords=()
  for service in "${DB_SERVICES[@]}"; do
    prefix="${service%-service}"
    key="${prefix^^}_DB_PASSWORD"
    value=$(read_database_password "$key")
    if [[ -z "$value" || "$value" == REPLACE_* || "$value" == your_* ]]; then
      validation_errors+=("[$key] Falta configurar la contraseña en $SECRETS_FILE.")
    fi
    for index in "${!passwords[@]}"; do
      if [[ -n "$value" && "$value" == "${passwords[$index]}" ]]; then
        validation_errors+=("[$key] Comparte la misma contraseña que ${keys[$index]}. Cada base de datos debe tener su propia contraseña.")
      fi
    done
    keys+=("$key")
    passwords+=("$value")
  done
}

validate_key_pair() {
  local private_key_name="$1" public_key_name="$2"
  local private_key public_key
  if ! private_key=$(read_local_secret "$private_key_name" | base64 --decode 2>/dev/null | openssl pkey -pubout -outform DER 2>/dev/null | base64 -w 0); then
    validation_errors+=("[$private_key_name] Debe ser una clave privada PEM codificada en base64 válida.")
    return 1
  fi
  if ! public_key=$(read_local_secret "$public_key_name" | base64 --decode 2>/dev/null | openssl pkey -pubin -pubout -outform DER 2>/dev/null | base64 -w 0); then
    validation_errors+=("[$public_key_name] Debe ser una clave pública PEM codificada en base64 válida.")
    return 1
  fi
  if [[ "$private_key" != "$public_key" ]]; then
    validation_errors+=("[$private_key_name / $public_key_name] Las claves no pertenecen al mismo par RSA.")
    return 1
  fi
}

validate_config() {
  local validation_errors=()

  if [[ ! -f "$SECRETS_FILE" ]]; then
    log_warn "No se encontró $SECRETS_FILE. Inicializando automáticamente con contraseñas seguras y pares RSA..."
    init_secrets
    echo ""
    log_warn "Se ha creado $SECRETS_FILE con las contraseñas de BD y claves RSA inicializadas."
  fi

  # 1. Validar Administrador Inicial (evita fallos tardíos en initContainers)
  local current_node_env
  if [[ -n "$NODE_ENV" ]]; then
    current_node_env="$NODE_ENV"
  else
    current_node_env=$(kubectl_local patch --local --type merge -f "$K8S_DIR/config/configmap.yaml" -p '{}' -o 'jsonpath={.data.NODE_ENV}')
  fi

  local admin_email admin_password
  admin_email=$(read_local_secret "SEED_ADMIN_EMAIL")
  admin_password=$(read_local_secret "SEED_ADMIN_PASSWORD")

  if [[ "$current_node_env" == "production" ]]; then
    if [[ -z "$admin_email" || "$admin_email" == REPLACE_* || "$admin_email" == your_* ]]; then
      validation_errors+=("[SEED_ADMIN_EMAIL] Falta configurar el correo del administrador inicial en secrets.yaml (requerido en producción).")
    fi

    local special_regex='[!@#$%^&*]'
    if [[ -z "$admin_password" || "$admin_password" == REPLACE_* || "$admin_password" == your_* ]]; then
      validation_errors+=("[SEED_ADMIN_PASSWORD] Falta configurar la contraseña del administrador inicial en secrets.yaml (requerida en producción).")
    elif (( ${#admin_password} < 8 )); then
      validation_errors+=("[SEED_ADMIN_PASSWORD] La contraseña del admin debe tener al menos 8 caracteres.")
    elif [[ ! "$admin_password" =~ $special_regex ]]; then
      validation_errors+=("[SEED_ADMIN_PASSWORD] En producción la contraseña debe contener al menos un carácter especial (!@#$%^&*).")
    fi
  else
    if [[ -n "$admin_password" && "$admin_password" != REPLACE_* && "$admin_password" != your_* ]] && (( ${#admin_password} < 8 )); then
      validation_errors+=("[SEED_ADMIN_PASSWORD] La contraseña del admin debe tener al menos 8 caracteres.")
    fi
  fi

  # 2. Validar Azure Blob Storage
  local azure_sas
  azure_sas=$(read_local_secret "AZURE_BLOB_SAS_URL")
  if [[ -z "$azure_sas" || "$azure_sas" == REPLACE_* || "$azure_sas" == your_* ]]; then
    validation_errors+=("[AZURE_BLOB_SAS_URL] Debes configurar la URL SAS de Azure Blob Storage en secrets.yaml.")
  elif [[ "$azure_sas" == https://dummy* ]]; then
    log_warn "AZURE_BLOB_SAS_URL está usando una URL dummy (permitido para pruebas locales)."
  fi

  # 3. Validar Contraseñas de Base de Datos
  validate_database_passwords

  # 4. Validar Pares RSA de JWT (ignora retorno para acumular todos los errores)
  validate_key_pair JWT_PRIVATE_KEY JWT_PUBLIC_KEY || true
  validate_key_pair JWT_REFRESH_PRIVATE_KEY JWT_REFRESH_PUBLIC_KEY || true

  # 5. Validar Proveedores de Correo
  local providers provider mail_ready=false
  local provider_names=() provider_keys=()
  providers=$(kubectl_local patch --local --type merge -f "$K8S_DIR/config/configmap.yaml" -p '{}' -o 'jsonpath={.data.EMAIL_PROVIDERS}')
  IFS=',' read -r -a provider_names <<< "$providers"
  for provider in "${provider_names[@]+"${provider_names[@]}"}"; do
    provider="${provider//[[:space:]]/}"
    [[ -z "$provider" ]] && continue
    case "$provider" in
      acs) provider_keys=(ACS_CONNECTION_STRING ACS_SENDER_ADDRESS) ;;
      emailjs) provider_keys=(EMAILJS_SERVICE_ID EMAILJS_TEMPLATE_ID EMAILJS_PUBLIC_KEY EMAILJS_PRIVATE_KEY) ;;
      *)
        validation_errors+=("[EMAIL_PROVIDERS] Proveedor de correo desconocido en configmap.yaml: $provider")
        continue
        ;;
    esac
    local provider_ready=true key
    for key in "${provider_keys[@]}"; do
      if ! secret_is_configured "$key"; then
        provider_ready=false
      fi
    done
    if [[ "$provider_ready" == true ]]; then
      mail_ready=true
    fi
  done

  if [[ "$mail_ready" != true ]]; then
    validation_errors+=("[EMAIL_PROVIDERS] Debes configurar las credenciales de al menos un proveedor de correo (ACS o EmailJS) en secrets.yaml.")
  fi

  # 6. Validar Servicios Seleccionados si se especificó --service
  if (( ${#SELECTED_SERVICES[@]} > 0 )); then
    local svc valid valid_svc
    for svc in "${SELECTED_SERVICES[@]}"; do
      valid=false
      for valid_svc in "${BACKEND_SERVICES[@]}"; do
        if [[ "$svc" == "$valid_svc" ]]; then
          valid=true
          break
        fi
      done
      if [[ "$valid" == false ]]; then
        validation_errors+=("[-s, --service] Servicio desconocido: '$svc'. Servicios válidos: ${BACKEND_SERVICES[*]}")
      fi
    done
  fi

  # 7. Reporte Consolidado si hay errores
  if (( ${#validation_errors[@]} > 0 )); then
    echo ""
    log_error "Se encontraron ${#validation_errors[@]} error(es) de configuración antes de continuar:"
    local err
    for err in "${validation_errors[@]}"; do
      echo -e "   ${RED}•${NC} $err"
    done
    echo ""
    log_warn "Corrige estos campos en $SECRETS_FILE (o en su archivo respectivo) y vuelve a intentarlo."
    return 1
  fi

  log_success "Configuración de Kubernetes válida."
}

prepare_secret() (
  umask 077
  local directory key
  directory=$(mktemp -d)
  trap 'rm -rf "$directory"' EXIT
  while IFS= read -r key; do
    [[ -z "$key" || "$key" == POSTGRES_PASSWORD ]] && continue
    read_local_secret "$key" > "$directory/$key"
  done < <(kubectl_local patch --local --type merge -f "$SECRETS_FILE" -p '{}' \
    -o 'go-template={{range $key, $value := .data}}{{printf "%s\n" $key}}{{end}}{{range $key, $value := .stringData}}{{printf "%s\n" $key}}{{end}}' | sort -u)
  kubectl_local create secret generic pcpi-secrets -n "$NAMESPACE" --dry-run=client --from-file="$directory/" -o yaml > "$1"
)

init_secrets() (
  local template_file="${SECRETS_TEMPLATE:-$K8S_DIR/config/secrets.example.yaml}"
  if [[ ! -f "$template_file" ]]; then
    log_error "No se encontró el archivo de plantilla: $template_file"
    return 1
  fi

  if [[ -f "$SECRETS_FILE" && "$FORCE_INIT" != true && -z "$SECRETS_TEMPLATE" ]]; then
    log_info "Se conserva el archivo existente $SECRETS_FILE. (Usa --force o --template para regenerarlo)."
    return
  fi

  umask 077
  local directory prefix service
  directory=$(mktemp -d)
  trap 'rm -rf "$directory"' EXIT

  declare -A generated_values

  for service in "${DB_SERVICES[@]}"; do
    prefix="${service%-service}"
    prefix="${prefix^^}"
    generated_values["${prefix}_DB_PASSWORD"]=$(openssl rand -hex 32)
  done

  for prefix in JWT JWT_REFRESH; do
    openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out "$directory/private.pem" 2>/dev/null
    generated_values["${prefix}_PRIVATE_KEY"]=$(base64 -w 0 < "$directory/private.pem")
    generated_values["${prefix}_PUBLIC_KEY"]=$(openssl pkey -in "$directory/private.pem" -pubout 2>/dev/null | base64 -w 0)
  done

  # Preserva el orden exacto, sangría y comentarios de la plantilla seleccionada
  local line key matched
  while IFS= read -r line || [[ -n "$line" ]]; do
    matched=false
    for key in "${!generated_values[@]}"; do
      if [[ "$line" =~ ^([[:space:]]*$key:[[:space:]]*).*$ ]]; then
        printf '%s"%s"\n' "${BASH_REMATCH[1]}" "${generated_values[$key]}" >> "$directory/secret.yaml"
        matched=true
        break
      fi
    done
    if [[ "$matched" == false ]]; then
      printf '%s\n' "$line" >> "$directory/secret.yaml"
    fi
  done < "$template_file"

  cat "$directory/secret.yaml" > "$SECRETS_FILE"
  log_success "Generado $SECRETS_FILE a partir de la plantilla '$template_file' con contraseñas de BD y llaves RSA nuevas."
)

deploy_config() (
  umask 077
  local directory insecure_cookies=true
  directory=$(mktemp -d)
  trap 'rm -rf "$directory"' EXIT
  [[ "$PUBLIC_URL" == https://* ]] && insecure_cookies=false
  prepare_secret "$directory/secret.yaml"
  local patch_data="\"FRONTEND_URL\":\"$PUBLIC_URL\",\"ALLOWED_ORIGINS\":\"$PUBLIC_URL\",\"ALLOW_INSECURE_COOKIES\":\"$insecure_cookies\",\"REDIRECT_URI\":\"$PUBLIC_URL/api/auth/callback\""
  if [[ -n "$NODE_ENV" ]]; then
    patch_data="$patch_data,\"NODE_ENV\":\"$NODE_ENV\""
  fi
  kubectl_local patch --local --type merge -f "$K8S_DIR/config/configmap.yaml" \
    -p "{\"data\":{$patch_data}}" \
    -o yaml | "${KUBECTL_COMMAND[@]}" apply -f -
  "${KUBECTL_COMMAND[@]}" apply -f "$directory/secret.yaml"
)

get_cluster_nodes() {
  "${KUBECTL_COMMAND[@]}" get nodes -o jsonpath='{range .items[*]}{.metadata.name}{"|"}{range .status.conditions[?(@.type=="Ready")]}{.status}{end}{"|"}{range .status.addresses[?(@.type=="InternalIP")]}{.address}{end}{"\n"}{end}' 2>/dev/null || true
}

resolve_ssh_target() {
  local node_name="$1"
  local node_ip="$2"
  local user_prefix=""
  if [[ -n "$K3S_SSH_USER" ]]; then
    user_prefix="${K3S_SSH_USER}@"
  fi

  local ssh_pass="${K3S_SSH_PASSWORD:-${SSHPASS:-}}"
  local candidate err_out
  for candidate in "$node_name" "$node_ip"; do
    [[ -z "$candidate" ]] && continue
    if [[ -n "$ssh_pass" ]] && command -v sshpass >/dev/null 2>&1; then
      if SSHPASS="$ssh_pass" sshpass -e ssh -o ConnectTimeout=4 -o StrictHostKeyChecking=accept-new "${user_prefix}${candidate}" "true" >/dev/null 2>&1; then
        printf '%s' "${user_prefix}${candidate}"
        return 0
      fi
    fi

    if err_out=$(ssh -o BatchMode=yes -o ConnectTimeout=4 -o StrictHostKeyChecking=accept-new -o ControlPath="/tmp/k3s-ssh-%r@%h:%p" "${user_prefix}${candidate}" "true" 2>&1); then
      printf '%s' "${user_prefix}${candidate}"
      return 0
    fi
    if grep -qiE 'permission denied|keyboard-interactive|password|authentication' <<< "$err_out"; then
      printf '%s' "${user_prefix}${candidate}"
      return 0
    fi
  done
  return 1
}

ensure_cluster() {
  if command -v systemctl >/dev/null 2>&1; then
    if ! systemctl is-active --quiet k3s.service; then
      log_warn "El servicio k3s no está activo. Iniciando..."
      "${SUDO_CMD[@]}" systemctl start k3s.service
    fi
  fi

  log_info "Verificando nodos activos (Ready) en el clúster k3s..."
  local attempt=0 max_attempts=30 nodes_raw="" ready_count=0
  local node_name node_ready node_ip

  while (( attempt < max_attempts )); do
    nodes_raw=$(get_cluster_nodes)
    ready_count=0
    while IFS='|' read -r node_name node_ready node_ip; do
      [[ -z "$node_name" ]] && continue
      if [[ "$node_ready" == "True" ]]; then
        ready_count=$((ready_count + 1))
      fi
    done <<< "$nodes_raw"

    if (( ready_count > 0 )); then
      break
    fi
    attempt=$((attempt + 1))
    sleep 2
  done

  if (( ready_count == 0 )); then
    log_error "No se encontró ningún nodo Ready en el clúster k3s después de esperar $((max_attempts * 2))s."
    "${KUBECTL_COMMAND[@]}" get nodes -o wide || true
    exit 1
  fi

  while IFS='|' read -r node_name node_ready node_ip; do
    [[ -z "$node_name" ]] && continue
    if [[ "$node_ready" == "True" ]]; then
      log_success "Nodo Ready: $node_name (${node_ip:-sin-ip})"
    else
      log_warn "Nodo no disponible (${node_ready:-Unknown}): $node_name (${node_ip:-sin-ip}) — se omitirá."
    fi
  done <<< "$nodes_raw"
}

get_target_services() {
  if (( ${#SELECTED_SERVICES[@]} > 0 )); then
    local target_list=()
    local svc valid valid_svc
    for svc in "${SELECTED_SERVICES[@]}"; do
      valid=false
      for valid_svc in "${BACKEND_SERVICES[@]}"; do
        if [[ "$svc" == "$valid_svc" ]]; then
          valid=true
          break
        fi
      done
      if [[ "$valid" == false ]]; then
        log_error "Servicio desconocido: '$svc'. Servicios válidos: ${BACKEND_SERVICES[*]}"
        exit 1
      fi
      target_list+=("$svc")
    done
    echo "${target_list[@]}"
  else
    echo "${BACKEND_SERVICES[@]}"
  fi
}

build_images() {
  local target_services
  read -r -a target_services <<< "$(get_target_services)"
  log_info "Compilando Backend (Producción) para: ${target_services[*]}..."
  local service
  for service in "${target_services[@]}"; do
    docker build --target production -t "pcpi/$service:latest" \
      -f "$BACKEND_DIR/apps/$service/Dockerfile" "$BACKEND_DIR"
  done

  log_success "Imágenes de Backend compiladas con sus etiquetas de Kubernetes."
}

load_images() {
  local target_services
  read -r -a target_services <<< "$(get_target_services)"
  local images=()
  local s image

  for s in "${target_services[@]}"; do
    image="pcpi/$s:latest"
    if ! docker image inspect "$image" >/dev/null 2>&1; then
      log_error "No existe la imagen local '$image'. Ejecuta 'build' primero o quita '--skip-build'."
      exit 1
    fi
    images+=("$image")
  done

  local local_short local_full
  local_short="$(hostname -s 2>/dev/null || hostname)"
  local_full="$(hostname 2>/dev/null || true)"

  local load_local=false
  local remote_nodes=()
  local remote_ssh_targets=()
  local nodes_raw node_name node_ready node_ip

  if [[ "$LOCAL_ONLY" == true ]]; then
    load_local=true
    log_info "Modo --local-only: se importarán imágenes solo en el nodo local ($local_short)."
  else
    nodes_raw=$(get_cluster_nodes)
    if [[ -z "$nodes_raw" ]]; then
      load_local=true
    else
      while IFS='|' read -r node_name node_ready node_ip; do
        [[ -z "$node_name" ]] && continue
        if [[ "$node_ready" != "True" ]]; then
          log_warn "Omitiendo carga en nodo '$node_name' (estado: ${node_ready:-Unknown})."
          continue
        fi
        if [[ "$node_name" == "$local_short" || "$node_name" == "$local_full" ]]; then
          load_local=true
        else
          remote_nodes+=("$node_name|$node_ip")
        fi
      done <<< "$nodes_raw"
    fi
  fi

  local ssh_pass="${K3S_SSH_PASSWORD:-${SSHPASS:-}}"
  local use_sshpass=false
  if [[ -n "$ssh_pass" ]]; then
    if command -v sshpass >/dev/null 2>&1; then
      use_sshpass=true
    else
      log_warn "Se definió K3S_SSH_PASSWORD/SSHPASS pero 'sshpass' no está instalado; se pedirá la contraseña manualmente."
    fi
  fi

  local ssh_opts=(-o ConnectTimeout=5 -o StrictHostKeyChecking=accept-new -o ControlMaster=auto -o ControlPath="/tmp/k3s-ssh-%r@%h:%p" -o ControlPersist=300)

  if (( ${#remote_nodes[@]} > 0 )); then
    require_cmd ssh "Instala openssh-client para distribuir imágenes a nodos worker Ready."
    local entry r_name r_ip resolved
    for entry in "${remote_nodes[@]}"; do
      IFS='|' read -r r_name r_ip <<< "$entry"
      if ! resolved=$(resolve_ssh_target "$r_name" "$r_ip"); then
        log_error "El nodo '$r_name' (${r_ip:-sin-ip}) está Ready pero no es alcanzable por SSH."
        log_warn "Verifica red/puerto 22 o usa '--local-only'."
        exit 1
      fi
      # Pre-autentica y abre socket ControlMaster antes del pipe de docker save
      if [[ "$use_sshpass" == true ]]; then
        SSHPASS="$ssh_pass" sshpass -e ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=accept-new "$resolved" "true"
      else
        if ! ssh -o BatchMode=yes "${ssh_opts[@]}" "$resolved" "true" >/dev/null 2>&1; then
          log_info "Autenticando SSH hacia '$r_name' ($resolved)..."
          ssh "${ssh_opts[@]}" "$resolved" "true"
        fi
      fi
      remote_ssh_targets+=("$r_name|$resolved")
    done
  fi

  log_info "Cargando ${#images[@]} imagen(es) de Backend en nodos Ready (${target_services[*]})..."

  if [[ "$load_local" == true ]]; then
    if (( ${#SUDO_CMD[@]} > 0 )); then
      sudo -v
    fi
    echo "  ↳ [k3s:$local_short] Importando imágenes en lote..."
    docker save "${images[@]}" | "${SUDO_CMD[@]}" k3s ctr --namespace k8s.io images import -
  fi

  local r_target remote_import_cmd
  remote_import_cmd='if [ "$(id -u)" -eq 0 ]; then k3s ctr --namespace k8s.io images import -; else sudo k3s ctr --namespace k8s.io images import -; fi'
  for entry in "${remote_ssh_targets[@]+"${remote_ssh_targets[@]}"}"; do
    IFS='|' read -r r_name r_target <<< "$entry"
    echo "  ↳ [k3s:$r_name] Enviando e importando imágenes por SSH ($r_target)..."
    if [[ "$use_sshpass" == true ]]; then
      docker save "${images[@]}" | SSHPASS="$ssh_pass" sshpass -e ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=accept-new "$r_target" "$remote_import_cmd"
    else
      docker save "${images[@]}" | ssh "${ssh_opts[@]}" "$r_target" "$remote_import_cmd"
    fi
  done

  log_success "Imágenes inyectadas correctamente en todos los nodos Ready."
}

deploy_infra() {
  log_info "Desplegando Namespace, Configs y Bases de Datos..."
  "${KUBECTL_COMMAND[@]}" apply -f "$K8S_DIR/namespace.yaml"
  deploy_config
  "${KUBECTL_COMMAND[@]}" apply -f "$K8S_DIR/databases/"

  log_info "Esperando que las bases de datos de Postgres estén Ready..."
  local s db
  for s in "${DB_SERVICES[@]}"; do
    db="${s//-service/-db}"
    echo "  ↳ Esperando pod/${db}-0..."
    if ! "${KUBECTL_COMMAND[@]}" rollout status "statefulset/$db" -n "$NAMESPACE" --timeout=180s; then
      log_error "Falló el arranque de la base de datos $db."
      "${KUBECTL_COMMAND[@]}" get pods -n "$NAMESPACE" -l "app=$db" || true
      "${KUBECTL_COMMAND[@]}" logs -n "$NAMESPACE" -l "app=$db" --all-containers=true --tail=50 || true
      "${KUBECTL_COMMAND[@]}" describe pod -n "$NAMESPACE" -l "app=$db" | tail -n 30 || true
      exit 1
    fi
  done
  log_success "Bases de datos listas."
}

run_migrations() {
  local target_services
  read -r -a target_services <<< "$(get_target_services)"
  local migration_services=()
  local s db_s
  for s in "${target_services[@]}"; do
    for db_s in "${DB_SERVICES[@]}"; do
      if [[ "$s" == "$db_s" ]]; then
        migration_services+=("$s")
        break
      fi
    done
  done

  if (( ${#migration_services[@]} == 0 )); then
    log_info "Ninguno de los servicios seleccionados requiere migraciones."
    return 0
  fi

  log_info "Las migraciones se ejecutan automáticamente en los initContainers de cada servicio."
  log_info "Reiniciando deployments para asegurar la ejecución de migraciones (${migration_services[*]})..."
  for s in "${migration_services[@]}"; do
    "${KUBECTL_COMMAND[@]}" rollout restart "deployment/$s" -n "$NAMESPACE"
  done
  for s in "${migration_services[@]}"; do
    "${KUBECTL_COMMAND[@]}" rollout status "deployment/$s" -n "$NAMESPACE" --timeout=180s
  done
  log_success "Migraciones completadas vía initContainers."
}

deploy_apps() {
  local target_services
  read -r -a target_services <<< "$(get_target_services)"
  local service

  if (( ${#SELECTED_SERVICES[@]} > 0 )); then
    log_info "Desplegando microservicios específicos de Backend: ${target_services[*]}..."
    for service in "${target_services[@]}"; do
      "${KUBECTL_COMMAND[@]}" apply -f "$K8S_DIR/services/$service.yaml"
    done
  else
    log_info "Desplegando microservicios de Backend..."
    "${KUBECTL_COMMAND[@]}" apply -f "$K8S_DIR/services/"
  fi

  deploy_ingress

  # Con tag ':latest' e imagePullPolicy IfNotPresent en containerd local, reiniciar fuerza la nueva imagen/config
  log_info "Actualizando pods para cargar las imágenes y la configuración (${target_services[*]})..."
  for service in "${target_services[@]}"; do
    "${KUBECTL_COMMAND[@]}" rollout restart "deployment/$service" -n "$NAMESPACE"
  done
  for service in "${target_services[@]}"; do
    if ! "${KUBECTL_COMMAND[@]}" rollout status "deployment/$service" -n "$NAMESPACE" --timeout=180s; then
      log_error "Falló el despliegue de $service."
      "${KUBECTL_COMMAND[@]}" get pods -n "$NAMESPACE" || true
      "${KUBECTL_COMMAND[@]}" logs -n "$NAMESPACE" -l "app=$service" --all-containers=true --tail=50 || true
      "${KUBECTL_COMMAND[@]}" describe pod -n "$NAMESPACE" -l "app=$service" | tail -n 25 || true
      exit 1
    fi
  done
  log_success "Servicios de Backend (${target_services[*]}) arriba y saludables."
}

discover_apps_for_logs() {
  local discovered
  discovered=$("${KUBECTL_COMMAND[@]}" get pods -n "$NAMESPACE" -o jsonpath='{range .items[*]}{.metadata.labels.app}{"\n"}{end}' 2>/dev/null | awk 'NF && !seen[$0]++') || true
  if [[ -n "$discovered" ]]; then
    printf '%s\n' "$discovered"
  else
    printf '%s\n' \
      "gateway" \
      "frontend" \
      "auth-service" \
      "evaluation-service" \
      "event-service" \
      "invitation-service" \
      "project-service" \
      "notification-service" \
      "auth-db" \
      "evaluation-db" \
      "event-db" \
      "invitation-db" \
      "project-db"
  fi
}

show_logs() {
  local target="${1:-$LOG_APP}"
  local container="$LOG_CONTAINER"
  local tail_lines="${LOG_TAIL:-100}"
  local follow_flags=()

  if [[ "$LOG_FOLLOW" == true ]]; then
    follow_flags+=("-f")
  fi

  if [[ -z "$target" ]]; then
    local available_apps=()
    while IFS= read -r line; do
      [[ -n "$line" ]] && available_apps+=("$line")
    done < <(discover_apps_for_logs)

    if [[ -t 0 ]] && (( ${#available_apps[@]} > 0 )); then
      echo ""
      echo -e "${BLUE}=== Selecciona el servicio o base de datos para ver logs ===${NC}"
      local i=1 app
      for app in "${available_apps[@]}"; do
        printf "  %2d) %s\n" "$i" "$app"
        ((i++))
      done
      echo ""
      local choice=""
      read -rp "Ingresa el número o nombre [Default: 1 (${available_apps[0]})]: " choice || true
      if [[ -z "$choice" ]]; then
        target="${available_apps[0]}"
      elif [[ "$choice" =~ ^[0-9]+$ ]] && (( choice >= 1 && choice <= ${#available_apps[@]} )); then
        target="${available_apps[$((choice - 1))]}"
      else
        target="$choice"
      fi
    else
      target="gateway"
    fi
  fi

  log_info "Consultando logs de '$target' en namespace '$NAMESPACE' (tail: $tail_lines)..."

  local target_args=()
  if "${KUBECTL_COMMAND[@]}" get pod "$target" -n "$NAMESPACE" &>/dev/null; then
    target_args=("$target")
  else
    target_args=("-l" "app=$target")
  fi

  local container_args=()
  if [[ -n "$container" ]]; then
    container_args=("-c" "$container")
  else
    container_args=("--all-containers=true")
  fi

  if ! "${KUBECTL_COMMAND[@]}" get pods -n "$NAMESPACE" "${target_args[@]}" --no-headers 2>/dev/null | grep -q .; then
    log_warn "No se encontraron pods para '$target' en el namespace '$NAMESPACE'."
    return 1
  fi

  if ! "${KUBECTL_COMMAND[@]}" logs -n "$NAMESPACE" "${target_args[@]}" "${container_args[@]}" --tail="$tail_lines" "${follow_flags[@]+"${follow_flags[@]}"}"; then
    log_warn "El contenedor aún no emite logs o presenta un error de inicialización. Mostrando estado y eventos del pod:"
    "${KUBECTL_COMMAND[@]}" get pods -n "$NAMESPACE" "${target_args[@]}" || true
    echo ""
    "${KUBECTL_COMMAND[@]}" describe pod -n "$NAMESPACE" "${target_args[@]}" | tail -n 35 || true
  fi
}

clean_all() {
  if [[ "$AUTO_YES" != true ]]; then
    log_warn "ATENCIÓN: Eliminar el namespace '$NAMESPACE' destruirá TODOS los pods, servicios y PVCs (datos de Postgres) de forma permanente."
    if [[ -t 0 ]]; then
      local confirm=""
      read -rp "¿Confirmas eliminar el namespace '$NAMESPACE'? [y/N]: " confirm || true
      if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
        log_info "Operación cancelada."
        return 0
      fi
    else
      log_error "Modo no interactivo: usa '-y' o '--yes' para confirmar la eliminación del namespace '$NAMESPACE'."
      return 1
    fi
  fi

  log_warn "Eliminando todos los recursos en namespace '$NAMESPACE'..."
  "${KUBECTL_COMMAND[@]}" delete namespace "$NAMESPACE" --ignore-not-found=true
  log_success "Namespace eliminado."
}

prune_images() {
  log_info "Limpiando imágenes sin uso en k3s (containerd) y Docker..."
  "${SUDO_CMD[@]}" k3s crictl rmi --prune || true
  docker image prune -f || true
  log_success "Limpieza de imágenes completada."
}

status() {
  echo "=== Nodos del clúster k3s ==="
  "${KUBECTL_COMMAND[@]}" get nodes -o wide
  echo ""
  echo "=== Pods en $NAMESPACE ==="
  "${KUBECTL_COMMAND[@]}" get pods -n "$NAMESPACE" -o wide
  echo ""
  echo "=== Servicios en $NAMESPACE ==="
  "${KUBECTL_COMMAND[@]}" get svc -n "$NAMESPACE"
  echo ""
  echo "=== Ingress en $NAMESPACE ==="
  "${KUBECTL_COMMAND[@]}" get ingress -n "$NAMESPACE" --ignore-not-found=true
}

show_help() {
  cat << EOF
Uso: $(basename "$0") <COMANDO> [OPCIONES]

Comandos disponibles (motor exclusivo: k3s):
  init       Prepara secrets.yaml con una contraseña por base de datos y pares RSA
  check      Valida configuración, claves y credenciales sin desplegar
  up         Ejecuta todo el flujo completo (build, load, deploy, migrate)
  build      Solo compila imágenes de producción de backend
  load       Solo carga las imágenes compiladas al containerd de k3s
  deploy     Aplica los manifiestos (infraestructura y servicios)
  migrate    Re-ejecuta migraciones reiniciando los deployments (vía initContainers)
  status     Muestra el estado de pods, servicios e ingress en k3s
  logs       Muestra logs de un servicio, pod o base de datos (con selector dinámico)
  down       Elimina el namespace y destruye los recursos en k3s
  prune      Elimina imágenes huérfanas/sin uso en k3s (crictl) y Docker

Opciones / Parámetros:
  --skip-build             Salta la compilación si ya tienes las imágenes listas
  --local-only             En 'load'/'up', importa imágenes solo en el nodo actual (omite workers)
  --public-url <url>       URL pública del frontend (Default: http://localhost)
  --node-env <ambiente>    Entorno de ejecución: production o development (Default: valor en configmap.yaml)
  -s, --service <servicio> Microservicio específico (auth-service, gateway, etc. o separados por comas)
  --template <archivo>     Plantilla base para 'init' (ej. secrets/secrets.dev.yaml)
  --force                  Fuerza la regeneración de secrets.yaml al ejecutar 'init'
  -y, --yes                Omite confirmación interactiva en 'down'
  -c, --container <nombre> Nombre del contenedor (ej. auth-migration, auth-service, postgres)
  --tail <líneas>          Número de líneas a mostrar (Default: 100)
  -f, --follow             Sigue los logs en tiempo real (Default: true)
  --no-follow              Muestra las líneas solicitadas y termina (sin -f)
  -h, --help               Muestra este mensaje de ayuda

Ejemplos:
  $(basename "$0") init
  $(basename "$0") check
  $(basename "$0") up
  $(basename "$0") up --public-url https://iris.tu-dominio.com
  $(basename "$0") up --skip-build -s gateway
  $(basename "$0") migrate
  $(basename "$0") logs                                (Selector dinámico interactivo)
  $(basename "$0") logs gateway                        (Sigue logs de gateway)
  $(basename "$0") logs auth-service -c auth-migration (Ver solo logs de la migración)
  $(basename "$0") logs auth-db --no-follow            (Ver logs de la base de datos sin -f)
  $(basename "$0") down --yes

Configura todas las credenciales y secretos en $SECRETS_FILE (generado con init).
La opción --public-url también acepta la variable de entorno PUBLIC_URL.
Para nodos worker sin llave SSH, permite escribir la contraseña o usar K3S_SSH_PASSWORD (requiere sshpass) y K3S_SSH_USER.
EOF
}

ACTION="${1:-}"

if [[ "$ACTION" == "-h" || "$ACTION" == "--help" || "$ACTION" == "help" || -z "$ACTION" ]]; then
  show_help
  exit 0
fi

shift || true

if [[ "$ACTION" == logs && $# -gt 0 && "$1" != -* ]]; then
  LOG_APP="$1"
  shift
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --public-url|--node-env|--env|--template|--tail|-c|--container|-s|--service)
      if [[ $# -lt 2 || -z "$2" || "$2" == --* ]]; then
        log_error "La opción $1 requiere un valor."
        exit 1
      fi
      ;;
  esac

  case "$1" in
    -s|--service)
      IFS=',' read -ra ADDR <<< "$2"
      for svc in "${ADDR[@]}"; do
        svc="$(echo "$svc" | tr -d ' ')"
        [[ -n "$svc" ]] && SELECTED_SERVICES+=("$svc")
      done
      shift 2
      ;;
    --skip-build)     SKIP_BUILD=true; shift ;;
    --local-only)     LOCAL_ONLY=true; shift ;;
    --force)          FORCE_INIT=true; shift ;;
    -y|--yes)         AUTO_YES=true; shift ;;
    --template)       SECRETS_TEMPLATE="$2"; shift 2 ;;
    --public-url)     PUBLIC_URL="$2"; shift 2 ;;
    --node-env|--env) NODE_ENV="$2"; shift 2 ;;
    --tail)           LOG_TAIL="$2"; shift 2 ;;
    -c|--container)   LOG_CONTAINER="$2"; shift 2 ;;
    -f|--follow)      LOG_FOLLOW=true; shift ;;
    --no-follow)      LOG_FOLLOW=false; shift ;;
    -h|--help)        show_help; exit 0 ;;
    *)
      if [[ "$ACTION" == logs && -z "$LOG_APP" && "$1" != -* ]]; then
        LOG_APP="$1"
        shift
      else
        log_error "Opción desconocida: $1"; show_help; exit 1
      fi
      ;;
  esac
done

setup_k3s_kubectl
preflight_checks "$ACTION"

case "$ACTION" in
  up|build|deploy|check)
    configure_public_url
    ;;
esac

case "$ACTION" in
  init) init_secrets ;;
  check) validate_config ;;
  up)
    validate_config
    ensure_cluster
    if [[ "$SKIP_BUILD" == false ]]; then
      build_images
    fi
    load_images
    deploy_infra
    deploy_apps
    status
    echo ""
    log_success "Despliegue de Backend completado con éxito."
    base_url="${PUBLIC_URL:-http://localhost}"
    log_info "Gateway / API: ${base_url%/}/api"
    log_info "Swagger:       ${base_url%/}/api/docs"
    ;;
  build)
    validate_config || exit 1
    build_images
    ;;
  load)     load_images ;;
  deploy)
    validate_config
    ensure_cluster
    deploy_infra
    deploy_apps
    ;;
  migrate)  run_migrations ;;
  status)   status ;;
  logs)     show_logs "$LOG_APP" ;;
  down)     clean_all ;;
  prune)    prune_images ;;
  *)        show_help; exit 1 ;;
esac
