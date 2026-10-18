import type {
  clientes,
  emailsClientes,
  estadoVehiculo,
  marcas,
  modelos,
  telefonosClientes,
  tiendas,
  tipoDeVenta,
} from "@/db/schema";
import type {
  ClienteDto,
  EstadoVehiculoDto,
  MarcaDto,
  ModeloDto,
  TiendaDto,
  TipoVentaDto,
} from "@/lib/dto";

type FilaCliente = typeof clientes.$inferSelect & {
  emails?: (typeof emailsClientes.$inferSelect)[];
  telefonos?: (typeof telefonosClientes.$inferSelect)[];
};

export function clienteDto(c: FilaCliente): ClienteDto {
  return {
    id: c.id,
    cliente_id: c.clienteId,
    dni: c.dni,
    nombre: c.nombre,
    fecha_de_nacimiento: c.fechaDeNacimiento,
    domicilio: c.domicilio,
    poblacion: c.poblacion,
    codigo_postal: c.codigoPostal,
    tienda_id: c.tiendaId,
    foto_id: c.fotoAdjuntoId,
    comentarios: c.comentarios,
    emails: (c.emails ?? []).map((e) => ({
      id_email_cliente: e.idEmailCliente,
      email: e.email,
      tipo_email: e.tipoEmail,
    })),
    telefonos: (c.telefonos ?? []).map((t) => ({
      id_telefono_cliente: t.idTelefonoCliente,
      telefono: t.telefono,
      tipo_telefono: t.tipoTelefono,
    })),
  };
}

export function marcaDto(m: typeof marcas.$inferSelect): MarcaDto {
  return {
    id_marca: m.idMarca,
    nombre: m.nombre,
    activo: m.activo,
    acceso_rapido: m.accesoRapido,
    sistema_comisiones: m.sistemaComisiones,
    color: m.color,
    punto: m.punto,
    punto_color: m.puntoColor,
  };
}

export function modeloDto(m: typeof modelos.$inferSelect & { marca?: typeof marcas.$inferSelect | null }): ModeloDto {
  return {
    id_modelo: m.idModelo,
    marca_id: m.marcaId,
    nombre_modelo: m.nombreModelo,
    acceso_rapido: m.accesoRapido,
    orden_acceso_rapido: m.ordenAccesoRapido,
    ...(m.marca !== undefined ? { marca: m.marca ? marcaDto(m.marca) : null } : {}),
  };
}

export function tipoVentaDto(t: typeof tipoDeVenta.$inferSelect): TipoVentaDto {
  return {
    id_tipo_de_venta: t.idTipoDeVenta,
    nombre_tipo_venta: t.nombreTipoVenta,
    color: t.color,
    orden: t.orden,
    categoria: t.categoria,
    requiere_rci_al_matricular: t.requiereRciAlMatricular,
    cuenta_para_tasa: t.cuentaParaTasa,
  };
}

export function estadoDto(e: typeof estadoVehiculo.$inferSelect): EstadoVehiculoDto {
  return {
    id_estado_vehiculo: e.idEstadoVehiculo,
    nombre_estado_vehiculo: e.nombreEstadoVehiculo,
    predeterminado: e.predeterminado,
    clase: e.clase,
    subtipo_vo: e.subtipoVo,
    color: e.color,
  };
}

export function tiendaDto(t: typeof tiendas.$inferSelect): TiendaDto {
  return { id_tienda: t.idTienda, nombre: t.nombre, ciudad: t.ciudad };
}
