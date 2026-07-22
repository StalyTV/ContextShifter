// `midi` is a native module for the optional TimeBuzzer dial. It has no
// prebuilt binary on some platforms (e.g. Windows without a C++ toolchain), so
// load it optionally — the app runs fine without dial support when it's absent.
let midi = null;
try {
  midi = require('midi');
} catch (e) {
  midi = null;
}
const log = require("electron-log")

module.exports =
  function (callback, debug) {
    this._active = true;
    this._debug = function (message) { };
    if (debug === true) {
      this._debug = function (message) {
        //console.log(message);
        log.debug(message);
      }
    }
    // noinspection JSUnusedLocalSymbols
    this.setColor = function (led, r, g, b) {
      throw 'timeBuzzer not initialized';
    };
    this.resetPosition = function () {
      throw 'timeBuzzer not initialized';
    };
    this.close = function () {
      throw 'timeBuzzer not initialized';
    };

    // Dial support unavailable (native `midi` module not installed): report no
    // device, exactly like the "no timeBuzzer port" path below.
    if (!midi) {
      callback('error', 'midi module not installed');
      return;
    }

    this.input = new midi.Input();
    this.output = new midi.Output();
    let timeBuzzerIn = -1;
    let timeBuzzerOut = -1;
    // find timeBuzzer output.
    for (var i = 0; i < this.output.getPortCount(); i++) {
      //this._debug(i + " output -> " + this.output.getPortName(i));
      log.debug(i + " output -> " + this.output.getPortName(i))
      if (this.output.getPortName(i).match('timeBuzzer')) {
        timeBuzzerOut = i;
        log.debug("buzzer-api: timeBuzzerOut is set to: " + timeBuzzerOut )
      }
    }

    // find timeBuzzer input.
    for (i = 0; i < this.input.getPortCount(); i++) {
      //this._debug(i + " input -> " + this.input.getPortName(i));
      log.debug(i + " input -> " + this.input.getPortName(i))
      if (this.input.getPortName(i).match('timeBuzzer')) {
        timeBuzzerIn = i;
        log.debug("buzzer-api: timeBuzzerIn is set to: " + timeBuzzerIn )
      }
    }

    if (timeBuzzerOut === -1 || timeBuzzerIn === -1) {
      callback('error', 'no timeBuzzer available');
      return;
    }
    // Open the first available input port.
    this.output.openPort(timeBuzzerOut);
    // var outputStream = midi.createWriteStream(output);
    let touchState = -1;
    let pressState = -1;
    let lastPosition = 0;
    let currentPosition = 0;

    this.close = function() {
      this._active = false;
      this.input.closePort(timeBuzzerIn);
      this.output.closePort(timeBuzzerOut);
    }

    // Configure a callback.
    this.input.on('message', (deltaTime, message) => {
      if (!this._active) {
        return;
      }
      // The message is an array of numbers corresponding to the MIDI bytes:
      //   [status, data1, data2]
      // https://www.cs.cf.ac.uk/Dave/Multimedia/node158.html has some helpful
      // information interpreting the messages.
      this._debug(`m: ${message} d: ${deltaTime}`);
      if (message[0] === 187 && message[1] === 81) {
        const newTouch = message[2] === 0;
        if (newTouch !== touchState) {
          callback('touch', newTouch);
        }
        touchState = newTouch;
      } else if (message[0] === 187 && message[1] === 82) {
        const newPress = message[2] === 0;
        if (newPress !== pressState) {
          callback('press', newPress);
        }
        pressState = newPress;
      } else if (message[0] === 187 && message[1] === 80) {
        const b = message[2];
        const delta = (b - lastPosition);
        lastPosition = b;
        if (!(delta > 64 || delta < -63)) {
          currentPosition += delta;
          callback('position', currentPosition);
          if (b < 10 || b > 117) {
            this.resetPosition();
            lastPosition = 64;
          }
        }
      }
    });
    // Open the first available input port.
    this.input.openPort(timeBuzzerIn);
    this.input.ignoreTypes(false, false, false);
    this.outputStream = midi.createWriteStream(this.output);

    let delay = ms => new Promise(resolve => setTimeout(resolve, ms));

    //timeBuzzerOut = this.output //-> das ist doch falsch da wird timeBuzzerOut überschrieben?
    let timeBuzzerOutput = this.output
    const writeToMidi = function (idx, val) {
      timeBuzzerOutput.sendMessage([187, idx, val]); // timeBuzzerOut.sendMessage([187, idx, val]);
      log.debug("buzzer-api: writeToMidi, timeBuzzerOut is: " + timeBuzzerOut )
    }

    this.setColor = function (led, r, g, b) {
      if (r < 0 || r > 255 || g < 0 || g > 255 || b < 0 || b > 255) {
        throw `Invalid color range ${r},${g},${b}`;
      }
      if (led < 0 && led >= 3) {
          throw `Invalid led ${led}`;
      }

      log.debug("buzzer-api: set color: ", led )

      return delay(1)
          .then(() => writeToMidi(70 + 3 * led, Math.floor(r / 2)))
          .then(() => delay(2))
          .then(() => writeToMidi(71 + 3 * led, Math.floor(g / 2)))
          .then(() => delay(2))
          .then(() => writeToMidi(72 + 3 * led, Math.floor(b / 2)))
          .then(() => delay(2))
    };

    this.resetPosition = function () {
      return delay(1)
          .then(() => writeToMidi(80, 64));
    };
  };

// Whether the native `midi` module loaded — lets callers skip dial setup
// entirely when the hardware backend isn't available on this platform.
module.exports.available = !!midi;
