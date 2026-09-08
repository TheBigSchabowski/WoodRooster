// Rendert ein Emoji als App-Icon-Quelle (1024x1024 PNG).
//
//   clang -framework AppKit -o /tmp/mkicon tools/make-emoji-icon.m
//   /tmp/mkicon 🔨 tools/icon-source.png
//
// Bewusst mit dem echten Systemfont statt nachgezeichnet: so sieht das Icon
// genauso aus wie das Emoji ueberall sonst auf dem Geraet. In Objective-C und
// nicht in Swift, weil die Swift-Version der Command Line Tools nicht zum
// mitgelieferten SDK passt.

#import <AppKit/AppKit.h>

int main(int argc, const char *argv[]) {
  @autoreleasepool {
    if (argc < 3) {
      fprintf(stderr, "Aufruf: %s <emoji> <ausgabe.png>\n", argv[0]);
      return 1;
    }
    // Ohne laufende NSApplication zeichnet AppKit keinen Text.
    [NSApplication sharedApplication];

    NSString *emoji = [NSString stringWithUTF8String:argv[1]];
    NSString *out = [NSString stringWithUTF8String:argv[2]];

    const NSInteger size = 1024;
    const CGFloat radius = 190;
    const CGFloat fontSize = 620;

    NSBitmapImageRep *rep = [[NSBitmapImageRep alloc]
        initWithBitmapDataPlanes:NULL
                      pixelsWide:size
                      pixelsHigh:size
                   bitsPerSample:8
                 samplesPerPixel:4
                        hasAlpha:YES
                        isPlanar:NO
                  colorSpaceName:NSDeviceRGBColorSpace
                     bytesPerRow:0
                    bitsPerPixel:0];
    if (!rep) return 1;

    [NSGraphicsContext saveGraphicsState];
    [NSGraphicsContext
        setCurrentContext:[NSGraphicsContext graphicsContextWithBitmapImageRep:rep]];

    // Derselbe dunkle Grund wie im Rest der App (--bg in styles.css).
    NSRect full = NSMakeRect(0, 0, size, size);
    NSBezierPath *rounded = [NSBezierPath bezierPathWithRoundedRect:full
                                                           xRadius:radius
                                                           yRadius:radius];
    [[NSColor colorWithSRGBRed:0x1c / 255.0
                         green:0x21 / 255.0
                          blue:0x2b / 255.0
                         alpha:1.0] setFill];
    [rounded fill];

    NSFont *font = [NSFont fontWithName:@"Apple Color Emoji" size:fontSize];
    if (!font) {
      fprintf(stderr, "Apple Color Emoji nicht gefunden\n");
      return 1;
    }
    NSAttributedString *text =
        [[NSAttributedString alloc] initWithString:emoji
                                        attributes:@{NSFontAttributeName : font}];
    NSSize ts = [text size];
    // Emoji sitzen optisch etwas hoch, daher leicht nach unten ruecken.
    [text drawAtPoint:NSMakePoint((size - ts.width) / 2,
                                  (size - ts.height) / 2 - fontSize * 0.04)];

    [NSGraphicsContext restoreGraphicsState];

    NSData *png = [rep representationUsingType:NSBitmapImageFileTypePNG properties:@{}];
    if (![png writeToFile:out atomically:YES]) {
      fprintf(stderr, "Schreiben nach %s fehlgeschlagen\n", argv[2]);
      return 1;
    }
    printf("%s  %ldx%ld  %lu KB\n", argv[2], (long)size, (long)size,
           (unsigned long)([png length] / 1024));
  }
  return 0;
}
