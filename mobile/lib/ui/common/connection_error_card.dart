import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../core/constants/app_colors.dart';

class ConnectionErrorCard extends StatefulWidget {
  final String rawError;

  const ConnectionErrorCard({
    super.key,
    required this.rawError,
  });

  @override
  State<ConnectionErrorCard> createState() => _ConnectionErrorCardState();
}

class _ConnectionErrorCardState extends State<ConnectionErrorCard> {
  bool _isExpanded = false;

  String _getFriendlySummary(String raw) {
    final lower = raw.toLowerCase();
    if (lower.contains('timeout')) {
      return 'Connection timed out. The server took too long to respond.';
    } else if (lower.contains('refused') || lower.contains('10061')) {
      return 'Connection refused. Ensure the desktop application is running.';
    } else if (lower.contains('host not found') ||
        lower.contains('nodename') ||
        lower.contains('no address associated') ||
        lower.contains('failed host lookup')) {
      return 'Server address could not be resolved. Please verify the IP address.';
    } else if (lower.contains('404')) {
      return 'Server responded, but YourPrinter service was not found on this port.';
    } else if (lower.contains('certificate') || lower.contains('handshake')) {
      return 'Security handshake error occurred while connecting to the server.';
    }
    return 'Unable to reach YourPrinter server. Please check your network and server settings.';
  }

  @override
  Widget build(BuildContext context) {
    final friendlyMessage = _getFriendlySummary(widget.rawError);

    return Container(
      decoration: BoxDecoration(
        color: AppColors.error.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.error.withValues(alpha: 0.35)),
      ),
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          // 1. Generic User-Friendly Header
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Padding(
                padding: EdgeInsets.only(top: 2),
                child: Icon(LucideIcons.alertCircle, size: 16, color: AppColors.error),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Connection Failed',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.bold,
                        color: AppColors.error,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      friendlyMessage,
                      style: const TextStyle(
                        fontSize: 11,
                        color: AppColors.textSecondary,
                        height: 1.3,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),

          const SizedBox(height: 8),

          // 2. Dropdown Toggle to See the True Message
          InkWell(
            onTap: () {
              setState(() {
                _isExpanded = !_isExpanded;
              });
            },
            borderRadius: BorderRadius.circular(6),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 4, horizontal: 2),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    _isExpanded ? 'Hide Technical Details' : 'View Technical Details',
                    style: const TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      color: AppColors.textMuted,
                    ),
                  ),
                  const SizedBox(width: 4),
                  Icon(
                    _isExpanded ? LucideIcons.chevronUp : LucideIcons.chevronDown,
                    size: 14,
                    color: AppColors.textMuted,
                  ),
                ],
              ),
            ),
          ),

          // 3. Dropdown Body: The True Technical Error
          if (_isExpanded) ...[
            const SizedBox(height: 8),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: Colors.black.withValues(alpha: 0.5),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: AppColors.border),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text(
                        'RAW ERROR LOG',
                        style: TextStyle(
                          fontFamily: 'monospace',
                          fontSize: 9,
                          fontWeight: FontWeight.bold,
                          color: AppColors.textMuted,
                          letterSpacing: 0.5,
                        ),
                      ),
                      IconButton(
                        icon: const Icon(LucideIcons.copy, size: 13, color: AppColors.textMuted),
                        padding: EdgeInsets.zero,
                        constraints: const BoxConstraints(),
                        tooltip: 'Copy Error',
                        onPressed: () {
                          Clipboard.setData(ClipboardData(text: widget.rawError));
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                              content: Text('Error copied to clipboard'),
                              duration: Duration(seconds: 2),
                              backgroundColor: AppColors.surfaceSecondary,
                            ),
                          );
                        },
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  SelectableText(
                    widget.rawError,
                    style: const TextStyle(
                      fontFamily: 'monospace',
                      fontSize: 10,
                      color: AppColors.error,
                      height: 1.35,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}
