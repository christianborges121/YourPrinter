import 'package:flutter/material.dart';

Future<double?> showTempSetpointDialog({
  required BuildContext context,
  required String title,
  required double currentVal,
  required double maxTemp,
}) {
  final controller = TextEditingController(
    text: currentVal > 0 ? currentVal.toStringAsFixed(0) : '',
  );

  return showDialog<double>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(title, style: const TextStyle(fontSize: 16)),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          TextField(
            controller: controller,
            keyboardType: TextInputType.number,
            autofocus: true,
            decoration: InputDecoration(
              hintText: 'Enter target °C (0 to turn off)',
              suffixText: '°C',
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
            ),
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            children: [
              ActionChip(
                label: const Text('Off (0°C)'),
                onPressed: () => controller.text = '0',
              ),
              if (maxTemp > 200) ...[
                ActionChip(
                  label: const Text('PLA (210°C)'),
                  onPressed: () => controller.text = '210',
                ),
                ActionChip(
                  label: const Text('PETG (240°C)'),
                  onPressed: () => controller.text = '240',
                ),
                ActionChip(
                  label: const Text('ABS (260°C)'),
                  onPressed: () => controller.text = '260',
                ),
              ] else ...[
                ActionChip(
                  label: const Text('PLA (60°C)'),
                  onPressed: () => controller.text = '60',
                ),
                ActionChip(
                  label: const Text('PETG (70°C)'),
                  onPressed: () => controller.text = '70',
                ),
                ActionChip(
                  label: const Text('ABS (100°C)'),
                  onPressed: () => controller.text = '100',
                ),
              ],
            ],
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(ctx).pop(null),
          child: const Text('Cancel'),
        ),
        ElevatedButton(
          onPressed: () {
            final val = double.tryParse(controller.text.trim());
            if (val != null && val >= 0 && val <= maxTemp) {
              Navigator.of(ctx).pop(val);
            }
          },
          child: const Text('Set Target'),
        ),
      ],
    ),
  );
}
