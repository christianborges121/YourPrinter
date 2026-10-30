import 'package:flutter/material.dart';
import '../../core/constants/app_colors.dart';

/// Crisp vector & badge widget for the official YourPrinter brand monogram.
class YourPrinterLogo extends StatelessWidget {
  final double size;
  final bool showBadge;
  final Color? color;

  const YourPrinterLogo({
    super.key,
    this.size = 32.0,
    this.showBadge = true,
    this.color,
  });

  @override
  Widget build(BuildContext context) {
    if (showBadge) {
      return Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          color: const Color(0xFF0B0F19),
          borderRadius: BorderRadius.circular(size * (26.0 / 120.0)),
          border: Border.all(
            color: const Color(0xFF1E293B),
            width: (size * (2.0 / 120.0)).clamp(1.0, 3.0),
          ),
          boxShadow: [
            BoxShadow(
              color: AppColors.accentGreen.withValues(alpha: 0.15),
              blurRadius: size * 0.25,
              spreadRadius: 1.0,
            ),
          ],
        ),
        clipBehavior: Clip.antiAlias,
        child: CustomPaint(
          size: Size(size, size),
          painter: _YourPrinterLogoPainter(
            brandColor: color ?? AppColors.accentGreen,
          ),
        ),
      );
    }

    return CustomPaint(
      size: Size(size, size),
      painter: _YourPrinterLogoPainter(
        brandColor: color ?? AppColors.accentGreen,
      ),
    );
  }
}

class _YourPrinterLogoPainter extends CustomPainter {
  final Color brandColor;

  _YourPrinterLogoPainter({required this.brandColor});

  @override
  void paint(Canvas canvas, Size size) {
    final scale = size.width / 120.0;
    final strokeWidth = 10.5 * scale;

    final paint = Paint()
      ..color = brandColor
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;

    // 1. Vertical Spine: (54, 25) -> (54, 95)
    canvas.drawLine(
      Offset(54.0 * scale, 25.0 * scale),
      Offset(54.0 * scale, 95.0 * scale),
      paint,
    );

    // 2. Y Left Branch: (29, 25) -> (54, 55)
    canvas.drawLine(
      Offset(29.0 * scale, 25.0 * scale),
      Offset(54.0 * scale, 55.0 * scale),
      paint,
    );

    // 3. P Loop: (54, 25) -> (77, 25) -> CubicTo -> (77, 55) -> (54, 55)
    final pPath = Path()
      ..moveTo(54.0 * scale, 25.0 * scale)
      ..lineTo(77.0 * scale, 25.0 * scale)
      ..cubicTo(
        96.0 * scale,
        25.0 * scale,
        96.0 * scale,
        55.0 * scale,
        77.0 * scale,
        55.0 * scale,
      )
      ..lineTo(54.0 * scale, 55.0 * scale);

    canvas.drawPath(pPath, paint);
  }

  @override
  bool shouldRepaint(covariant _YourPrinterLogoPainter oldDelegate) {
    return oldDelegate.brandColor != brandColor;
  }
}
