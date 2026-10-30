import 'package:flutter/material.dart';
import '../../core/constants/app_colors.dart';

class StatusBadge extends StatelessWidget {
  final String statusText;
  final bool isPrinting;
  final bool isCompleted;

  const StatusBadge({
    super.key,
    required this.statusText,
    this.isPrinting = false,
    this.isCompleted = false,
  });

  @override
  Widget build(BuildContext context) {
    Color bg;
    Color fg;
    Color dot;

    if (isCompleted) {
      bg = AppColors.infoSubtle;
      fg = AppColors.info;
      dot = AppColors.info;
    } else if (isPrinting) {
      bg = AppColors.accentGreenSubtle;
      fg = AppColors.accentGreen;
      dot = AppColors.accentGreen;
    } else if (statusText.toLowerCase().contains('offline')) {
      bg = AppColors.border;
      fg = AppColors.textMuted;
      dot = AppColors.textMuted;
    } else {
      bg = AppColors.surfaceSecondary;
      fg = AppColors.textSecondary;
      dot = AppColors.warning;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: dot.withValues(alpha: 0.3), width: 1),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 6,
            height: 6,
            decoration: BoxDecoration(
              color: dot,
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 5),
          Text(
            statusText,
            style: TextStyle(
              color: fg,
              fontSize: 11,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}
