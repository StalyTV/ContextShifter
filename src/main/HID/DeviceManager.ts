/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, May 2023
 */

import { info, error } from 'electron-log';
import UsageData from '../entity/UsageData';
import HID from 'node-hid';
import { usb } from 'usb';
import StaticSettings from '../StaticSettings';
import RGB from '../../types/RGB';
import TaskSnap from '../TaskSnap';

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
  private _connectedDevice: HID.HID | undefined;
  private _lastButtonClick: number = Date.now();

  private constructor() {
    this.registerListeners();
    this.findConnectedDevices();
  }

  public static getInstance() {
    return this._instance || (this._instance = new this());
  }

  private async findConnectedDevices(): Promise<void> {
    info('[DeviceManager] Finding connected usb devices...');
    const allDevices = HID.devices();

    const connectedSupportedDevice = allDevices.find(
      (dev) =>
        dev.vendorId === supportedDevice.vendorId &&
        dev.productId === supportedDevice.productId
    );
    if (connectedSupportedDevice && connectedSupportedDevice.path) {
      info(`[DeviceManager] ${supportedDevice.name} is connected`);
      try {
        this._connectedDevice = new HID.HID(connectedSupportedDevice.path);
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
    usb.unrefHotplugEvents();
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
    // after a click, wait 5 seconds before the next click has an effect. This should avoid accidental multiple clicks.
    if (this._lastButtonClick + 5 * 1000 < Date.now()) {
      this._lastButtonClick = Date.now();
      TaskSnap.getInstance().createNewSnapshot('usb_device');
    }
  }

  public isDeviceConnected(): boolean {
    return this._connectedDevice ? true : false;
  }
}
