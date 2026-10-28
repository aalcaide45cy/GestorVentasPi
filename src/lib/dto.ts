/**
 * Tipos de datos que viajan entre servidor y navegador (JSON plano, claves en snake_case
 * como las columnas de la base de datos y como en la aplicación original).
 */

export interface EmailDto {
  id_email_cliente?: number;
  email: string;
  tipo_email: string | null;
}

export interface TelefonoDto {
  id_telefono_cliente?: number;
  telefono: string;
  tipo_telefono: string | null;
}

export interface ClienteDto {
  id: number;
  cliente_id: string;
  dni: string | null;
  nombre: string | null;
  fecha_de_nacimiento: string | null;
  domicilio?: string | null;
  poblacion?: string | null;
  codigo_postal?: string | null;
  tienda_id: number | null;
  /** Adjunto con la foto del cliente (se ve al pasar el ratón), si se ha leído su DNI. */
  foto_id?: number | null;
  comentarios?: string | null;
  emails: EmailDto[];
  telefonos: TelefonoDto[];
}

export interface MarcaDto {
  id_marca: number;
  nombre: string;
  activo: boolean | null;
  acceso_rapido: boolean | null;
  sistema_comisiones: boolean;
  /** Color del borde de la cápsula de la marca y el modelo (#RRGGBB) o null. */
  color: string | null;
  /** Símbolo y color de la columna del punto, o null. */
  punto: string | null;
  punto_color: string | null;
}

export interface ModeloDto {
  id_modelo: number;
  marca_id: number | null;
  nombre_modelo: string;
  acceso_rapido: boolean | null;
  orden_acceso_rapido: number | null;
  marca?: MarcaDto | null;
}

export interface TipoVentaDto {
  id_tipo_de_venta: number;
  nombre_tipo_venta: string;
  color: string | null;
  orden: number;
  categoria: string;
  /** Exige fecha RCI para poder matricular (crédito y preference por defecto). */
  requiere_rci_al_matricular: boolean;
  /** Suma a la tasa de intervención financiera. */
  cuenta_para_tasa: boolean;
}

export interface EstadoVehiculoDto {
  id_estado_vehiculo: number;
  nombre_estado_vehiculo: string;
  predeterminado: boolean | null;
  clase: string;
  subtipo_vo: string | null;
  color: string | null;
  /** Borde de la cápsula, punto y quién prevalece (el estado o la marca) para los coches de este estado. */
  capsula_color: string | null;
  punto: string | null;
  punto_color: string | null;
  prevalece: "marca" | "estado";
}

export interface TiendaDto {
  id_tienda: number;
  nombre: string;
  ciudad: string | null;
}

export interface VendedorDto {
  id_usuario: number;
  nombre: string;
}

export interface ExpedienteDto {
  id_expediente: number;
  id_usuario: number | null;
  id_cliente: number | null;
  id_modelo: number | null;
  id_tienda: number | null;
  id_tipo_de_venta: number | null;
  id_estado_vehiculo: number | null;
  fecha_expediente: string | null;
  fecha_afectacion: string | null;
  fecha_matriculacion: string | null;
  fecha_entrega: string | null;
  fecha_rci: string | null;
  fecha_facturacion: string | null;
  matricula: string | null;
  vin: string | null;
  comentarios?: string | null;
  cobrado_otra_fecha: boolean;
  fecha_cobrado: string | null;
  comision_cobrada: boolean;
  /** Solo en el listado: si la comisión de este expediente ya se ha pagado o reclamado según el Cotejo de pagos. */
  /** Si es un duplicado hecho con «Duplicar»: expediente del que se copió. */
  copia_de?: number | null;
  /** La copia lleva la etiqueta visible «COPIA». */
  copia_etiqueta?: boolean;
  comisionado?: { estado: "pagado" | "reclamado"; mes: string } | null;
  /** Solo en el listado: los apuntes del expediente (título y etiqueta; la descripción se pide al abrirlo). */
  apuntes?: { id: number; id_predefinido: number | null; titulo: string; etiqueta: string; color: string; mostrar_etiqueta: boolean; lado: "izquierda" | "derecha"; estilo: "relleno" | "texto"; colorear_emoticonos: boolean; comentario: string; estado_semaforo: number | null; estados: { color: string; texto: string; apagado?: boolean; icono?: string; modo?: "color" | "icono" | "icono_fondo"; efecto?: "ninguno" | "parpadeo" | "pulso" | "destello" | "latido" | "brillo" }[] | null }[];
  comision_coche_cobrada: boolean;
  comision_usado_cobrada: boolean;
  comision_financiacion_cobrada: boolean;
  comision_preference_cobrada: boolean;
  comision_bonus_cobrada: boolean;
  puntos: number | null;
  id_promocion: number | null;
  comision_coche_manual: number | null;
  comision_financiacion_manual: number | null;
  conceptos_especiales: { titulo: string; importe_centimos: number; descripcion: string; evento: "pedido" | "afectacion" | "rci" | "matriculacion" | "fecha_matriculacion" | "facturacion" | "entrega" | "cobro"; cobrado: boolean }[];
  /** Claves de los bonus «manuales» del plan elegidos para este expediente. */
  bonus_manuales: string[];
  /** Deshabilitado: no cuenta en las comisiones ni en la tasa mientras lo esté. */
  deshabilitado: boolean;
  /** Estado en la intranet del fabricante (Archivado, Anulado…), si se ha importado de sus listados. */
  estado_intranet: string | null;
  /** Primera matriculación del vehículo (en un usado, años atrás); no cuenta para las comisiones. */
  fecha_primera_matriculacion: string | null;
  cliente: ClienteDto | null;
  modelo: ModeloDto | null;
  tipoDeVenta: TipoVentaDto | null;
  estadoVehiculo: EstadoVehiculoDto | null;
  usuario: { id_usuario: number; nombre: string | null } | null;
}

export interface UsuarioAdminDto {
  id_usuario: number;
  login_email: string;
  nombre: string | null;
  rol: string | null;
  fecha_de_registro: string | null;
  bloqueado: boolean;
  tipo_vendedor: string;
  patron_vo: string | null;
  tienda_predeterminada_id: number | null;
  totp_activo: boolean;
  debe_cambiar_password: boolean;
  emails: { email: string; tipo_email: string | null }[];
  telefonos: { telefono: string; tipo_telefono: string | null }[];
  tiendas: number[];
}
