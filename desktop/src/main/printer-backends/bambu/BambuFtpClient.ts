/**
 * @fileoverview Bambu Lab FTPS client for local job uploading and listing.
 *
 * Communicates with Bambu Lab printers over implicit TLS on port 990 using
 * username 'bblp' and the printer's LAN Access Code.
 */

import { Client } from 'basic-ftp';

export interface BambuFtpClientOptions {
  readonly ip: string;
  readonly accessCode: string;
}

export interface BambuFtpFileEntry {
  readonly name: string;
  readonly size: number;
  readonly modifiedAt?: Date;
  readonly rawModifiedAt?: string;
}

export class BambuFtpClient {
  /**
   * Upload a file to the printer's SD card root over FTPS
   */
  public static async uploadFile(
    ip: string,
    accessCode: string,
    localPath: string,
    remoteName: string
  ): Promise<void> {
    const client = new Client();
    client.ftp.verbose = false;

    try {
      await client.access({
        host: ip,
        port: 990,
        user: 'bblp',
        password: accessCode,
        secure: 'implicit',
        secureOptions: {
          rejectUnauthorized: false,
        },
      });

      const cleanRemoteName = remoteName.startsWith('/') ? remoteName : `/${remoteName}`;
      await client.uploadFrom(localPath, cleanRemoteName);
    } finally {
      client.close();
    }
  }

  /**
   * List printable file entries (.3mf, .gcode) with metadata on printer's SD card root
   */
  public static async listFileEntries(ip: string, accessCode: string): Promise<BambuFtpFileEntry[]> {
    const client = new Client();
    client.ftp.verbose = false;

    try {
      await client.access({
        host: ip,
        port: 990,
        user: 'bblp',
        password: accessCode,
        secure: 'implicit',
        secureOptions: {
          rejectUnauthorized: false,
        },
      });

      const list = await client.list('/');
      return list
        .filter((item) => !item.isDirectory && /\.(3mf|gcode)$/i.test(item.name))
        .map((item) => ({
          name: item.name,
          size: item.size,
          modifiedAt: item.modifiedAt,
          rawModifiedAt: item.rawModifiedAt,
        }));
    } catch (err) {
      console.warn('[BambuFtpClient] Failed to list file entries over FTPS:', err);
      return [];
    } finally {
      client.close();
    }
  }

  /**
   * List printable files (.3mf, .gcode) on printer's SD card root
   */
  public static async listFiles(ip: string, accessCode: string): Promise<string[]> {
    const entries = await BambuFtpClient.listFileEntries(ip, accessCode);
    return entries.map((item) => item.name);
  }
}
