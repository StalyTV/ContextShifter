/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, May 2023
 */

import { info, error } from 'electron-log';
import type * as NodeHID from 'node-hid';
import UsageData from '../entity/UsageData';
import StaticSettings from '../StaticSettings';
import RGB from '../../types/RGB';

// `node-hid` and `usb` are optional native modules for the Luxafor/HID dial
// button (no prebuilt binary on some platforms, e.g. Windows without a C++
// toolchain). Load them defensively so the app runs without dial support when
// they're absent.
let nodeHid: typeof NodeHID | null = null;
let usb: any = null;
try {
  // eslint-disable-next-line global-require
  nodeHid = require('node-hid');
  // eslint-disable-next-line global-require
  ({ usb } = require('usb'));
} catch (e) {
  nodeHid = null;
  usb = null;
}

const supportedDevice: {
  name: string;
  vendorId: number;
  productId: number;
  clickBuffer: Buffer;
} = {
  name: 'Luxafor Mute Button',
  vendorId: 1240,
  productId: 62322,
  clickBuffer: Buffer.from([0x83, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
};

export default class DeviceManager {
  private static _instance: DeviceManager;
  private _connectedDevice: NodeHID.HID | undefined;
  private _lastButtonClick: number = Date.now();

  private constructor() {
    // No native HID/USB backend on this platform — stay dormant.
    if (!nodeHid || !usb) {
      info('[DeviceManager] HID/USB modules unavailable — disabled');
      return;
    }
    this.registerListeners();
    this.findConnectedDevices();
  }

  public static getInstance() {
    return this._instance || (this._instance = new this());
  }

  private async findConnectedDevices(): Promise<void> {
    if (!nodeHid) return;
    info('[DeviceManager] Finding connected usb devices...');
    const allDevices = nodeHid.devices();

    const connectedSupportedDevice = allDevices.find(
      (dev) =>
        dev.vendorId === supportedDevice.vendorId &&
        dev.productId === supportedDevice.productId
    );
    if (connectedSupportedDevice && connectedSupportedDevice.path) {
      info(`[DeviceManager] ${supportedDevice.name} is connected`);
      try {
        this._connectedDevice = new nodeHid.HID(connectedSupportedDevice.path);
        this.showLightPulse(1000);

        this._connectedDevice.on('data', (data) => {
          if (Buffer.compare(data, supportedDevice.clickBuffer) === 0) {
            this.onClickButton();
          }
        });
        this._connectedDevice.on('error', (err) => {
          error(`[DeviceManager]`, err);
        });

        await UsageData.addEntry(
          'connect-supported-usb-device',
          true,
          supportedDevice.name
        );
      } catch (err) {
        error('[DeviceManager] Not able to open device', err);
      }
    } else if (!connectedSupportedDevice && this._connectedDevice) {
      info(`[DeviceManager] ${supportedDevice.name} disconnected`);
      this._connectedDevice.close();
      this._connectedDevice = undefined;
      await UsageData.addEntry(
        'disconnect-supported-usb-device',
        true,
        supportedDevice.name
      );
    }
  }

  public registerListeners() {
    if (!usb) return;
    usb.on('attach', () => {
      //! This should really not be required.. but it is what is recommended by the the maintainer of node-hid
      //! See this https://github.com/node-hid/node-hid/issues/422
      setTimeout(() => {
        this.findConnectedDevices();
      }, 2000);
    });

    usb.on('detach', () => {
      this.findConnectedDevices();
    });
  }

  public stopMonitoring() {
    this._connectedDevice?.close();
    usb?.unrefHotplugEvents();
  }

  public showLightPulse(length: number = StaticSettings.LIGHT_PULSE_LENGTH) {
    this.setLightColor(StaticSettings.LIGHT_PULSE_COLOR);

    setTimeout(() => {
      this.setLightColor({ r: 0, g: 0, b: 0 });
    }, length);
  }

  private setLightColor(color: RGB) {
    if (this._connectedDevice) {
      try {
        this._connectedDevice.write([
          0x00,
          0x01,
          0xff,
          color.r,
          color.g,
          color.b,
          0x00,
          0x00,
          0x00,
        ]);
      } catch (err) {
        error('[DeviceManager] Not able to write to connected device', err);
      }
    }
  }

  private onClickButton() {
    // Throttled HID press: legacy snapshot trigger has been removed; the
    // button currently does nothing until a new action is wired up.
    if (this._lastButtonClick + 5 * 1000 < Date.now()) {
      this._lastButtonClick = Date.now();
    }
  }

  public isDeviceConnected(): boolean {
    return this._connectedDevice ? true : false;
  }
}
