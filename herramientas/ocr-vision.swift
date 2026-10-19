// Lector de texto de Apple Vision (solo macOS). Lo compila la propia aplicación la primera vez que se elige «Apple Vision» como motor de
// lectura de pedidos (hace falta swiftc: se instala con «xcode-select --install»).
//
// Uso:  ocr-vision <imagen.png|jpg>
// Salida (JSON en una sola línea por la salida estándar):
//   {"ancho":1500,"alto":2100,"cajas":[{"texto":"…","confianza":0.98,"x0":10.5,"y0":20.1,"x1":300.2,"y1":44.7}, …]}
// Las coordenadas están en píxeles de la imagen, con el origen arriba a la izquierda. Código de salida distinto de 0 si no se pudo leer.

import Foundation
import ImageIO
import Vision

func fallar(_ mensaje: String, _ codigo: Int32) -> Never {
    FileHandle.standardError.write((mensaje + "\n").data(using: .utf8)!)
    exit(codigo)
}

guard CommandLine.arguments.count >= 2 else { fallar("Uso: ocr-vision <imagen>", 64) }
let url = URL(fileURLWithPath: CommandLine.arguments[1])
guard let origen = CGImageSourceCreateWithURL(url as CFURL, nil), let imagen = CGImageSourceCreateImageAtIndex(origen, 0, nil) else {
    fallar("No se pudo abrir la imagen", 66)
}

let peticion = VNRecognizeTextRequest()
peticion.recognitionLevel = .accurate
peticion.recognitionLanguages = ["es-ES", "en-US"]
// La corrección con diccionario ayuda con texto corrido, pero estropea DNI, matrículas y bastidores: se apaga
peticion.usesLanguageCorrection = false

do {
    try VNImageRequestHandler(cgImage: imagen, options: [:]).perform([peticion])
} catch {
    fallar("Vision ha fallado: \(error.localizedDescription)", 70)
}

let ancho = Double(imagen.width)
let alto = Double(imagen.height)
var cajas: [[String: Any]] = []
for observacion in peticion.results ?? [] {
    guard let candidato = observacion.topCandidates(1).first else { continue }
    let r = observacion.boundingBox // normalizado, con el origen abajo a la izquierda
    cajas.append([
        "texto": candidato.string,
        "confianza": Double(candidato.confidence),
        "x0": r.minX * ancho,
        "y0": (1 - r.maxY) * alto,
        "x1": r.maxX * ancho,
        "y1": (1 - r.minY) * alto,
    ])
}

let salida: [String: Any] = ["ancho": ancho, "alto": alto, "cajas": cajas]
guard let datos = try? JSONSerialization.data(withJSONObject: salida, options: []) else { fallar("No se pudo preparar el resultado", 70) }
FileHandle.standardOutput.write(datos)
