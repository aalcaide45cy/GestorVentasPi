/**
 * Plantilla «Genérica Renault y Dacia» de las tarifas de modelos VN por tramo (importes en céntimos), tomada de la aplicación
 * anterior. Se instala con la migración 0014 y la semilla la repone si falta.
 */
export interface DatosPlantillaTarifas {
  marcas: { nombre: string; sistemaComisiones: boolean; accesoRapido: boolean }[];
  tarifas: { marca: string; modelo: string; tasaCumplida: boolean; importes: Record<string, number>; activo: boolean; orden: number }[];
}

export const NOMBRE_PLANTILLA_GENERICA = "Genérica Renault y Dacia";
export const DESCRIPCION_PLANTILLA_GENERICA = "Tarifas de modelos VN por tramo de Renault (13 modelos) y Dacia (7 modelos), tomadas de la aplicación anterior (planes de 2026). Los importes están en euros por coche; cada modelo tiene una línea con tasa de intervención cumplida y otra sin cumplir.";

export const PLANTILLA_GENERICA: DatosPlantillaTarifas = {
  "marcas": [
    {
      "nombre": "Renault",
      "sistemaComisiones": true,
      "accesoRapido": true
    },
    {
      "nombre": "Dacia",
      "sistemaComisiones": true,
      "accesoRapido": true
    }
  ],
  "tarifas": [
    {
      "marca": "Renault",
      "modelo": "Clio",
      "tasaCumplida": false,
      "importes": {
        "0": 5000,
        "1": 6000,
        "2": 7000,
        "3": 8000,
        "-4": 1000,
        "-3": 2000,
        "-2": 3000,
        "-1": 4000
      },
      "activo": true,
      "orden": 0
    },
    {
      "marca": "Renault",
      "modelo": "Clio",
      "tasaCumplida": true,
      "importes": {
        "0": 10000,
        "1": 11000,
        "2": 12500,
        "3": 14000,
        "-4": 3000,
        "-3": 4000,
        "-2": 6000,
        "-1": 8000
      },
      "activo": true,
      "orden": 0
    },
    {
      "marca": "Renault",
      "modelo": "Clio CL6",
      "tasaCumplida": false,
      "importes": {
        "0": 5000,
        "1": 6000,
        "2": 7000,
        "3": 8000,
        "-4": 1000,
        "-3": 2000,
        "-2": 3000,
        "-1": 4000
      },
      "activo": true,
      "orden": 1
    },
    {
      "marca": "Renault",
      "modelo": "Clio CL6",
      "tasaCumplida": true,
      "importes": {
        "0": 10000,
        "1": 11000,
        "2": 12500,
        "3": 14000,
        "-4": 3000,
        "-3": 4000,
        "-2": 6000,
        "-1": 8000
      },
      "activo": true,
      "orden": 1
    },
    {
      "marca": "Renault",
      "modelo": "Captur",
      "tasaCumplida": false,
      "importes": {
        "0": 5000,
        "1": 6000,
        "2": 7000,
        "3": 8000,
        "-4": 1000,
        "-3": 2000,
        "-2": 3000,
        "-1": 4000
      },
      "activo": true,
      "orden": 2
    },
    {
      "marca": "Renault",
      "modelo": "Captur",
      "tasaCumplida": true,
      "importes": {
        "0": 10000,
        "1": 11000,
        "2": 12500,
        "3": 14000,
        "-4": 3000,
        "-3": 4000,
        "-2": 6000,
        "-1": 8000
      },
      "activo": true,
      "orden": 2
    },
    {
      "marca": "Renault",
      "modelo": "Symbioz",
      "tasaCumplida": false,
      "importes": {
        "0": 5000,
        "1": 6000,
        "2": 7000,
        "3": 8000,
        "-4": 1000,
        "-3": 2000,
        "-2": 3000,
        "-1": 4000
      },
      "activo": true,
      "orden": 3
    },
    {
      "marca": "Renault",
      "modelo": "Symbioz",
      "tasaCumplida": true,
      "importes": {
        "0": 10000,
        "1": 11000,
        "2": 12500,
        "3": 14000,
        "-4": 3000,
        "-3": 4000,
        "-2": 6000,
        "-1": 8000
      },
      "activo": true,
      "orden": 3
    },
    {
      "marca": "Renault",
      "modelo": "Arkana",
      "tasaCumplida": false,
      "importes": {
        "0": 5000,
        "1": 6000,
        "2": 7000,
        "3": 8000,
        "-4": 1000,
        "-3": 2000,
        "-2": 3000,
        "-1": 4000
      },
      "activo": true,
      "orden": 4
    },
    {
      "marca": "Renault",
      "modelo": "Arkana",
      "tasaCumplida": true,
      "importes": {
        "0": 10000,
        "1": 11000,
        "2": 12500,
        "3": 14000,
        "-4": 3000,
        "-3": 4000,
        "-2": 6000,
        "-1": 8000
      },
      "activo": true,
      "orden": 4
    },
    {
      "marca": "Renault",
      "modelo": "Austral",
      "tasaCumplida": false,
      "importes": {
        "0": 5000,
        "1": 6000,
        "2": 7000,
        "3": 8000,
        "-4": 1000,
        "-3": 2000,
        "-2": 3000,
        "-1": 4000
      },
      "activo": true,
      "orden": 5
    },
    {
      "marca": "Renault",
      "modelo": "Austral",
      "tasaCumplida": true,
      "importes": {
        "0": 10000,
        "1": 11000,
        "2": 12500,
        "3": 14000,
        "-4": 3000,
        "-3": 4000,
        "-2": 6000,
        "-1": 8000
      },
      "activo": true,
      "orden": 5
    },
    {
      "marca": "Renault",
      "modelo": "Espace",
      "tasaCumplida": false,
      "importes": {
        "0": 5000,
        "1": 6000,
        "2": 7000,
        "3": 8000,
        "-4": 1000,
        "-3": 2000,
        "-2": 3000,
        "-1": 4000
      },
      "activo": true,
      "orden": 6
    },
    {
      "marca": "Renault",
      "modelo": "Espace",
      "tasaCumplida": true,
      "importes": {
        "0": 10000,
        "1": 11000,
        "2": 12500,
        "3": 14000,
        "-4": 3000,
        "-3": 4000,
        "-2": 6000,
        "-1": 8000
      },
      "activo": true,
      "orden": 6
    },
    {
      "marca": "Renault",
      "modelo": "Rafale",
      "tasaCumplida": false,
      "importes": {
        "0": 5000,
        "1": 6000,
        "2": 7000,
        "3": 8000,
        "-4": 1000,
        "-3": 2000,
        "-2": 3000,
        "-1": 4000
      },
      "activo": true,
      "orden": 7
    },
    {
      "marca": "Renault",
      "modelo": "Rafale",
      "tasaCumplida": true,
      "importes": {
        "0": 10000,
        "1": 11000,
        "2": 12500,
        "3": 14000,
        "-4": 3000,
        "-3": 4000,
        "-2": 6000,
        "-1": 8000
      },
      "activo": true,
      "orden": 7
    },
    {
      "marca": "Renault",
      "modelo": "R5",
      "tasaCumplida": false,
      "importes": {
        "0": 5000,
        "1": 6000,
        "2": 7000,
        "3": 8000,
        "-4": 1000,
        "-3": 2000,
        "-2": 3000,
        "-1": 4000
      },
      "activo": true,
      "orden": 8
    },
    {
      "marca": "Renault",
      "modelo": "R5",
      "tasaCumplida": true,
      "importes": {
        "0": 10000,
        "1": 11000,
        "2": 12500,
        "3": 14000,
        "-4": 3000,
        "-3": 4000,
        "-2": 6000,
        "-1": 8000
      },
      "activo": true,
      "orden": 8
    },
    {
      "marca": "Renault",
      "modelo": "R4",
      "tasaCumplida": false,
      "importes": {
        "0": 5000,
        "1": 6000,
        "2": 7000,
        "3": 8000,
        "-4": 1000,
        "-3": 2000,
        "-2": 3000,
        "-1": 4000
      },
      "activo": true,
      "orden": 9
    },
    {
      "marca": "Renault",
      "modelo": "R4",
      "tasaCumplida": true,
      "importes": {
        "0": 10000,
        "1": 11000,
        "2": 12500,
        "3": 14000,
        "-4": 3000,
        "-3": 4000,
        "-2": 6000,
        "-1": 8000
      },
      "activo": true,
      "orden": 9
    },
    {
      "marca": "Renault",
      "modelo": "Twingo",
      "tasaCumplida": false,
      "importes": {
        "0": 5000,
        "1": 6000,
        "2": 7000,
        "3": 8000,
        "-4": 1000,
        "-3": 2000,
        "-2": 3000,
        "-1": 4000
      },
      "activo": true,
      "orden": 10
    },
    {
      "marca": "Renault",
      "modelo": "Twingo",
      "tasaCumplida": true,
      "importes": {
        "0": 10000,
        "1": 11000,
        "2": 12500,
        "3": 14000,
        "-4": 3000,
        "-3": 4000,
        "-2": 6000,
        "-1": 8000
      },
      "activo": true,
      "orden": 10
    },
    {
      "marca": "Renault",
      "modelo": "Scenic",
      "tasaCumplida": false,
      "importes": {
        "0": 5000,
        "1": 6000,
        "2": 7000,
        "3": 8000,
        "-4": 1000,
        "-3": 2000,
        "-2": 3000,
        "-1": 4000
      },
      "activo": true,
      "orden": 11
    },
    {
      "marca": "Renault",
      "modelo": "Scenic",
      "tasaCumplida": true,
      "importes": {
        "0": 10000,
        "1": 11000,
        "2": 12500,
        "3": 14000,
        "-4": 3000,
        "-3": 4000,
        "-2": 6000,
        "-1": 8000
      },
      "activo": true,
      "orden": 11
    },
    {
      "marca": "Renault",
      "modelo": "Megane E-Tech",
      "tasaCumplida": false,
      "importes": {
        "0": 5000,
        "1": 6000,
        "2": 7000,
        "3": 8000,
        "-4": 1000,
        "-3": 2000,
        "-2": 3000,
        "-1": 4000
      },
      "activo": true,
      "orden": 12
    },
    {
      "marca": "Renault",
      "modelo": "Megane E-Tech",
      "tasaCumplida": true,
      "importes": {
        "0": 10000,
        "1": 11000,
        "2": 12500,
        "3": 14000,
        "-4": 3000,
        "-3": 4000,
        "-2": 6000,
        "-1": 8000
      },
      "activo": true,
      "orden": 12
    },
    {
      "marca": "Dacia",
      "modelo": "Sandero",
      "tasaCumplida": false,
      "importes": {
        "0": 2000,
        "1": 2500,
        "2": 3000,
        "3": 3000,
        "-4": 500,
        "-3": 500,
        "-2": 1000,
        "-1": 1000
      },
      "activo": true,
      "orden": 0
    },
    {
      "marca": "Dacia",
      "modelo": "Sandero",
      "tasaCumplida": true,
      "importes": {
        "0": 5000,
        "1": 5500,
        "2": 6000,
        "3": 6000,
        "-4": 1000,
        "-3": 1000,
        "-2": 2000,
        "-1": 3000
      },
      "activo": true,
      "orden": 0
    },
    {
      "marca": "Dacia",
      "modelo": "Sandero Stepway",
      "tasaCumplida": false,
      "importes": {
        "0": 2000,
        "1": 2500,
        "2": 3000,
        "3": 3000,
        "-4": 500,
        "-3": 500,
        "-2": 1000,
        "-1": 1000
      },
      "activo": true,
      "orden": 1
    },
    {
      "marca": "Dacia",
      "modelo": "Sandero Stepway",
      "tasaCumplida": true,
      "importes": {
        "0": 5000,
        "1": 5500,
        "2": 6000,
        "3": 6000,
        "-4": 1000,
        "-3": 1000,
        "-2": 2000,
        "-1": 3000
      },
      "activo": true,
      "orden": 1
    },
    {
      "marca": "Dacia",
      "modelo": "Jogger",
      "tasaCumplida": false,
      "importes": {
        "0": 2000,
        "1": 2500,
        "2": 3000,
        "3": 3000,
        "-4": 500,
        "-3": 500,
        "-2": 1000,
        "-1": 1000
      },
      "activo": true,
      "orden": 2
    },
    {
      "marca": "Dacia",
      "modelo": "Jogger",
      "tasaCumplida": true,
      "importes": {
        "0": 5000,
        "1": 5500,
        "2": 6000,
        "3": 6000,
        "-4": 1000,
        "-3": 1000,
        "-2": 2000,
        "-1": 3000
      },
      "activo": true,
      "orden": 2
    },
    {
      "marca": "Dacia",
      "modelo": "Duster",
      "tasaCumplida": false,
      "importes": {
        "0": 2000,
        "1": 2500,
        "2": 3000,
        "3": 3000,
        "-4": 500,
        "-3": 500,
        "-2": 1000,
        "-1": 1000
      },
      "activo": true,
      "orden": 3
    },
    {
      "marca": "Dacia",
      "modelo": "Duster",
      "tasaCumplida": true,
      "importes": {
        "0": 5000,
        "1": 5500,
        "2": 6000,
        "3": 6000,
        "-4": 1000,
        "-3": 1000,
        "-2": 2000,
        "-1": 3000
      },
      "activo": true,
      "orden": 3
    },
    {
      "marca": "Dacia",
      "modelo": "Bigster",
      "tasaCumplida": false,
      "importes": {
        "0": 2000,
        "1": 2500,
        "2": 3000,
        "3": 3000,
        "-4": 500,
        "-3": 500,
        "-2": 1000,
        "-1": 1000
      },
      "activo": true,
      "orden": 4
    },
    {
      "marca": "Dacia",
      "modelo": "Bigster",
      "tasaCumplida": true,
      "importes": {
        "0": 5000,
        "1": 5500,
        "2": 6000,
        "3": 6000,
        "-4": 1000,
        "-3": 1000,
        "-2": 2000,
        "-1": 3000
      },
      "activo": true,
      "orden": 4
    },
    {
      "marca": "Dacia",
      "modelo": "Spring",
      "tasaCumplida": false,
      "importes": {
        "0": 2000,
        "1": 2500,
        "2": 3000,
        "3": 3000,
        "-4": 500,
        "-3": 500,
        "-2": 1000,
        "-1": 1000
      },
      "activo": true,
      "orden": 5
    },
    {
      "marca": "Dacia",
      "modelo": "Spring",
      "tasaCumplida": true,
      "importes": {
        "0": 5000,
        "1": 5500,
        "2": 6000,
        "3": 6000,
        "-4": 1000,
        "-3": 1000,
        "-2": 2000,
        "-1": 3000
      },
      "activo": true,
      "orden": 5
    }
  ]
};

// Dacia Striker (próximo lanzamiento): mismas tarifas que el Jogger hasta que la marca publique las suyas
for (const t of PLANTILLA_GENERICA.tarifas.filter((x) => x.marca === "Dacia" && x.modelo === "Jogger")) {
  PLANTILLA_GENERICA.tarifas.push({ ...t, modelo: "Striker", importes: { ...t.importes }, orden: 6 });
}

/** Orden por defecto de los modelos dentro de cada marca (el que se ve en las tarifas del plan). */
const ORDEN_MODELOS: Record<string, string[]> = {
  Dacia: ["Sandero", "Sandero Stepway", "Duster", "Jogger", "Bigster", "Striker", "Spring"],
  Renault: ["Clio", "Clio CL6", "Captur", "Symbioz", "Arkana", "Austral", "Espace", "Rafale", "R5", "R4", "Twingo", "Scenic", "Megane E-Tech"],
};
for (const t of PLANTILLA_GENERICA.tarifas) t.orden = ORDEN_MODELOS[t.marca]?.indexOf(t.modelo) ?? 99;
PLANTILLA_GENERICA.tarifas.sort((a, b) => a.marca.localeCompare(b.marca) || a.orden - b.orden || Number(b.tasaCumplida) - Number(a.tasaCumplida));

