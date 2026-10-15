import { relations } from "drizzle-orm";
import {
  clientes,
  emailsClientes,
  emailsUsuarios,
  estadoVehiculo,
  expedientes,
  importacionesBloques,
  importacionesRegistros,
  marcas,
  modelos,
  telefonosClientes,
  telefonosUsuarios,
  tiendas,
  tipoDeVenta,
  usuarios,
  usuariosTiendas,
} from "./schema";

export const usuariosRelations = relations(usuarios, ({ one, many }) => ({
  tiendaPredeterminada: one(tiendas, { fields: [usuarios.tiendaPredeterminadaId], references: [tiendas.idTienda] }),
  tiendas: many(usuariosTiendas),
  emails: many(emailsUsuarios),
  telefonos: many(telefonosUsuarios),
  expedientes: many(expedientes),
}));

export const usuariosTiendasRelations = relations(usuariosTiendas, ({ one }) => ({
  usuario: one(usuarios, { fields: [usuariosTiendas.idUsuario], references: [usuarios.idUsuario] }),
  tienda: one(tiendas, { fields: [usuariosTiendas.idTienda], references: [tiendas.idTienda] }),
}));

export const emailsUsuariosRelations = relations(emailsUsuarios, ({ one }) => ({
  usuario: one(usuarios, { fields: [emailsUsuarios.idUsuario], references: [usuarios.idUsuario] }),
}));

export const telefonosUsuariosRelations = relations(telefonosUsuarios, ({ one }) => ({
  usuario: one(usuarios, { fields: [telefonosUsuarios.idUsuario], references: [usuarios.idUsuario] }),
}));

export const clientesRelations = relations(clientes, ({ one, many }) => ({
  tienda: one(tiendas, { fields: [clientes.tiendaId], references: [tiendas.idTienda] }),
  emails: many(emailsClientes),
  telefonos: many(telefonosClientes),
  expedientes: many(expedientes),
}));

export const emailsClientesRelations = relations(emailsClientes, ({ one }) => ({
  cliente: one(clientes, { fields: [emailsClientes.idCliente], references: [clientes.id] }),
}));

export const telefonosClientesRelations = relations(telefonosClientes, ({ one }) => ({
  cliente: one(clientes, { fields: [telefonosClientes.idCliente], references: [clientes.id] }),
}));

export const marcasRelations = relations(marcas, ({ many }) => ({
  modelos: many(modelos),
}));

export const modelosRelations = relations(modelos, ({ one, many }) => ({
  marca: one(marcas, { fields: [modelos.marcaId], references: [marcas.idMarca] }),
  expedientes: many(expedientes),
}));

export const tipoDeVentaRelations = relations(tipoDeVenta, ({ many }) => ({
  expedientes: many(expedientes),
}));

export const estadoVehiculoRelations = relations(estadoVehiculo, ({ many }) => ({
  expedientes: many(expedientes),
}));

export const expedientesRelations = relations(expedientes, ({ one }) => ({
  usuario: one(usuarios, { fields: [expedientes.idUsuario], references: [usuarios.idUsuario] }),
  cliente: one(clientes, { fields: [expedientes.idCliente], references: [clientes.id] }),
  modelo: one(modelos, { fields: [expedientes.idModelo], references: [modelos.idModelo] }),
  tienda: one(tiendas, { fields: [expedientes.idTienda], references: [tiendas.idTienda] }),
  tipoDeVenta: one(tipoDeVenta, { fields: [expedientes.idTipoDeVenta], references: [tipoDeVenta.idTipoDeVenta] }),
  estadoVehiculo: one(estadoVehiculo, {
    fields: [expedientes.idEstadoVehiculo],
    references: [estadoVehiculo.idEstadoVehiculo],
  }),
}));

export const importacionesBloquesRelations = relations(importacionesBloques, ({ one, many }) => ({
  usuario: one(usuarios, { fields: [importacionesBloques.usuarioId], references: [usuarios.idUsuario] }),
  registros: many(importacionesRegistros),
}));

export const importacionesRegistrosRelations = relations(importacionesRegistros, ({ one }) => ({
  bloque: one(importacionesBloques, {
    fields: [importacionesRegistros.bloqueId],
    references: [importacionesBloques.id],
  }),
  expediente: one(expedientes, {
    fields: [importacionesRegistros.idExpediente],
    references: [expedientes.idExpediente],
  }),
}));
