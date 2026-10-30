/**
 * @fileoverview Jest tests for BambuCameraBridge auth packet and session handling.
 */

import { BambuCameraBridge, BambuCameraSession, getBambuCameraBridge } from '../BambuCameraBridge.js';

describe('BambuCameraBridge', () => {
  it('correctly constructs the 80-byte binary auth packet', () => {
    const accessCode = '12345678';
    const packet = BambuCameraSession.createAuthPacket(accessCode);

    expect(packet.length).toBe(80);
    // Payload length: 0x40
    expect(packet.readUInt32LE(0)).toBe(0x40);
    // Command ID: 0x3000
    expect(packet.readUInt32LE(4)).toBe(0x3000);
    expect(packet.readUInt32LE(8)).toBe(0);
    expect(packet.readUInt32LE(12)).toBe(0);

    // Username at offset 16 null-padded
    const username = packet.subarray(16, 48).toString('ascii').replace(/\0/g, '');
    expect(username).toBe('bblp');

    // Access code at offset 48 null-padded
    const extractedCode = packet.subarray(48, 80).toString('ascii').replace(/\0/g, '');
    expect(extractedCode).toBe(accessCode);
  });

  it('manages singleton instance and printer registrations', () => {
    const bridge = getBambuCameraBridge();
    expect(bridge).toBe(BambuCameraBridge.getInstance());

    bridge.registerPrinter('TEST-SERIAL-1', {
      ip: '192.168.1.100',
      accessCode: 'secret123',
    });

    bridge.unregisterPrinter('TEST-SERIAL-1');
  });
});
