import Foundation
import Vision
import ImageIO
let input=CommandLine.arguments[1]
let output=CommandLine.arguments[2]
let files=try FileManager.default.contentsOfDirectory(atPath: input).filter{$0.hasPrefix("scan-") && $0.hasSuffix(".png")}.sorted()
var result:[[String:Any]]=[]
for file in files {
 let url=URL(fileURLWithPath:input).appendingPathComponent(file)
 let src=CGImageSourceCreateWithURL(url as CFURL,nil)!
 let image=CGImageSourceCreateImageAtIndex(src,0,nil)!
 let request=VNRecognizeTextRequest()
 request.recognitionLevel = .accurate
 request.recognitionLanguages = ["en-US","zh-Hans"]
 request.usesLanguageCorrection = false
 request.minimumTextHeight = 0.002
 try VNImageRequestHandler(cgImage:image,orientation:.up,options:[:]).perform([request])
 let lines=(request.results ?? []).compactMap{observation -> [String:Any]? in
  guard let candidate=observation.topCandidates(1).first else{return nil}
  let b=observation.boundingBox
  return ["text":candidate.string,"confidence":candidate.confidence,"x":b.minX,"y":1-b.maxY,"w":b.width,"h":b.height]
 }
 result.append(["file":file,"orientation":"up","lines":lines])
 let data=try JSONSerialization.data(withJSONObject:result,options:[.prettyPrinted,.sortedKeys])
 try data.write(to:URL(fileURLWithPath:output),options:.atomic)
 print("OCR \(file): \(lines.count) lines")
}
