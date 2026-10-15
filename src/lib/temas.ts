/**
 * Temas de color de la aplicación. Cada tema es una paleta (tonos HSL) que se aplica sobre las variables CSS existentes:
 * no cambia el diseño, solo los colores. Los dos primeros son el oscuro y el claro originales (sin cambios).
 */
export interface TemaColor {
  id: string;
  nombre: string;
  modo: "dark" | "light";
  /** Tono principal, secundario y de acento (0–360). */
  p: number;
  s: number;
  a: number;
  /** Tono y saturación (%) de los fondos. */
  f: number;
  g: number;
  /** Claridad del fondo (%): oscuros 8 / 15 / 22 (cada vez menos oscuros); claros 96 / 90 / 84 (cada vez menos claros). */
  n: number;
  /** Variante: 0 = estándar, 1 = intermedia, 2 = suave (dark) o tintada (light). */
  v: 0 | 1 | 2;
}

export const TEMA_OSCURO = "oscuro";
export const TEMA_CLARO = "claro";

/** Familias de color: nombre, principal, secundario, acento, tono de fondo, saturación de fondo (en oscuro). */
const FAMILIAS: [string, number, number, number, number, number][] = [
  ["Violeta", 255, 195, 335, 230, 25],
  ["Índigo", 235, 200, 300, 232, 28],
  ["Azul", 215, 185, 280, 218, 28],
  ["Cielo", 200, 170, 260, 205, 26],
  ["Turquesa", 180, 150, 260, 190, 24],
  ["Esmeralda", 155, 190, 50, 165, 22],
  ["Verde", 135, 175, 40, 140, 18],
  ["Lima", 85, 140, 30, 95, 18],
  ["Ámbar", 42, 20, 200, 35, 18],
  ["Naranja", 25, 45, 215, 20, 20],
  ["Coral", 10, 340, 190, 12, 20],
  ["Rojo", 355, 20, 210, 350, 22],
  ["Rosa", 335, 285, 175, 330, 22],
  ["Magenta", 310, 255, 160, 305, 22],
  ["Púrpura", 280, 235, 150, 275, 24],
  ["Océano", 205, 230, 160, 215, 35],
  ["Bosque", 150, 100, 20, 150, 22],
  ["Atardecer", 18, 330, 255, 280, 22],
  ["Medianoche", 225, 265, 195, 240, 38],
  ["Grafito", 220, 200, 260, 220, 6],
  ["Café", 28, 15, 195, 25, 14],
  ["Arena", 45, 30, 200, 40, 12],
  ["Menta", 165, 140, 280, 170, 16],
  ["Lavanda", 262, 300, 190, 260, 20],
  ["Cereza", 345, 300, 190, 340, 26],
];

const NIVELES_OSCURO: [string, number][] = [["oscuro", 8], ["medio", 15], ["suave", 22]];
const NIVELES_CLARO: [string, number][] = [["claro", 96], ["tenue", 90], ["tinte", 84]];
const sinAcentos = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/** 25 familias × 6 variantes (3 oscuras y 3 claras) = 150 temas. */
export const TEMAS: TemaColor[] = FAMILIAS.flatMap(([nombre, p, s, a, f, g]) => [
  ...NIVELES_OSCURO.map(([sufijo, n], v): TemaColor => ({ id: sinAcentos(`${nombre.toLowerCase()}-${sufijo}`), nombre: `${nombre} ${sufijo}`, modo: "dark", p, s, a, f, g, n, v: v as 0 | 1 | 2 })),
  ...NIVELES_CLARO.map(([sufijo, n], v): TemaColor => ({ id: sinAcentos(`${nombre.toLowerCase()}-${sufijo}`), nombre: `${nombre} ${sufijo}`, modo: "light", p, s, a, f, g, n, v: v as 0 | 1 | 2 })),
]);

/** Colores de muestra de un tema (para las tarjetas del selector). */
export function muestraTema(t: TemaColor): { fondo: string; tarjeta: string; principal: string; secundario: string; acento: string; texto: string } {
  const oscuro = t.modo === "dark";
  return {
    fondo: oscuro ? `hsl(${t.f}, ${t.g}%, ${t.n}%)` : `hsl(${t.f}, ${Math.round(t.g * 0.8)}%, ${t.n}%)`,
    tarjeta: oscuro ? `hsl(${t.f}, ${t.g}%, ${t.n + 5}%)` : t.n >= 96 ? "hsl(0, 0%, 100%)" : `hsl(${t.f}, ${Math.round(t.g * 0.5)}%, ${Math.min(99, t.n + 7)}%)`,
    principal: `hsl(${t.p}, 85%, 62%)`,
    secundario: `hsl(${t.s}, 90%, 55%)`,
    acento: `hsl(${t.a}, 85%, 60%)`,
    texto: oscuro ? "hsl(220, 20%, 98%)" : "hsl(224, 71%, 4%)",
  };
}

/**
 * Script que se ejecuta antes de pintar la página: aplica el tema guardado (sin parpadeo) y deja `window.__gvTema(id)`
 * para cambiarlo desde la interfaz. La fórmula de colores vive solo aquí; la lista de temas se incrusta como datos.
 */
export function scriptTema(): string {
  const datos = JSON.stringify(TEMAS.map((t) => [t.id, t.modo === "dark" ? 0 : 1, t.p, t.s, t.a, t.f, t.g, t.n]));
  return `(function(){
var T=${datos},R=document.documentElement,V=[];
function rgb(h,s,l){s/=100;l/=100;var k=function(n){return(n+h/30)%12},a=s*Math.min(l,1-l),f=function(n){var x=k(n);return Math.round(255*(l-a*Math.max(-1,Math.min(x-3,9-x,1))))};return f(0)+', '+f(8)+', '+f(4)}
function limpiar(){for(var i=0;i<V.length;i++)R.style.removeProperty(V[i]);V=[]}
function poner(n,v){R.style.setProperty(n,v);V.push(n)}
function ap(id){
 limpiar();
 var t=null;for(var i=0;i<T.length;i++)if(T[i][0]===id)t=T[i];
 var claro=t?t[1]===1:id==='claro';
 R.setAttribute('data-theme',claro?'light':'dark');
 try{localStorage.setItem('theme',claro?'light':'dark');localStorage.setItem('colorTheme',id)}catch(e){}
 if(!t)return;
 var p=t[2],s=t[3],a=t[4],f=t[5],g=t[6],n=t[7];
 poner('--primary-hue',p);poner('--secondary-hue',s);poner('--accent-hue',a);
 poner('--accent-rgb',rgb(p,85,62));poner('--secondary-rgb',rgb(s,90,55));
 if(claro){
  var gs=Math.round(g*0.8),gt=Math.round(g*0.5);
  poner('--bg-app','hsl('+f+', '+gs+'%, '+n+'%)');poner('--bg-surface-hover','hsl('+f+', '+gs+'%, '+(n-3)+'%)');
  if(n<96){var sf='hsl('+f+', '+gt+'%, '+Math.min(99,n+7)+'%)';poner('--bg-surface',sf);poner('--bg-card',sf);poner('--bg-surface-glass','hsla('+f+', '+gt+'%, '+Math.min(99,n+8)+'%, 0.85)')}
 }else{
  poner('--bg-app','hsl('+f+', '+g+'%, '+n+'%)');poner('--bg-surface','hsl('+f+', '+g+'%, '+(n+4)+'%)');poner('--bg-card','hsl('+f+', '+g+'%, '+(n+4)+'%)');
  poner('--bg-surface-hover','hsl('+f+', '+g+'%, '+(n+8)+'%)');poner('--bg-surface-glass','hsla('+f+', '+g+'%, '+(n+1)+'%, 0.65)');
 }
}
window.__gvTema=ap;
try{var c=localStorage.getItem('colorTheme'),m=localStorage.getItem('theme')||'dark';ap(c||(m==='light'?'claro':'oscuro'))}catch(e){ap('oscuro')}
})()`;
}
