# Clean Kadal boat-control setup

This guide is for a **classic Arduino Nano (ATmega328P)**, a TB6612FNG dual H-bridge module, two brushed DC motors, a separate motor battery, and the Clean Kadal web dashboard. Nano 33 BLE, Nano Every, Nano ESP32, and other variants are different boards; verify their pinout and USB serial behavior before using this sketch.

## Safety first

- **Do not connect motors directly to Nano GPIO pins.** The Nano is not a motor power supply.
- Bench-test with propellers removed and the hull restrained. Keep hands, loose clothing, and wires clear of rotating parts.
- Use a physical, accessible switch to interrupt the motor battery. The web emergency-stop is a serial software command, not a hardware power cut-off.
- Check each motor's **stall current** against the exact driver module, wiring, cooling, and battery. Toshiba lists TB6612FNG absolute maximums of VM 15 V, average output 1.2 A, and peak output 3.2 A; absolute/peak ratings are not safe design targets. Follow the English datasheet's recommended operating conditions and the specific breakout-board documentation.
- Keep the motor supply separate from USB/logic power, but connect grounds together. Never route motor current through the Nano's 5 V pin or USB cable.
- Stop if the driver, motor, connector, or battery heats rapidly, smells, resets, or behaves unexpectedly.

Sources: [Toshiba TB6612FNG product page and datasheet links](https://toshiba.semicon-storage.com/us/semiconductor/product/motor-driver-ics/brushed-dc-motor-driver-ics/detail.TB6612FNG.html), [Arduino Nano hardware and official pinout](https://docs.arduino.cc/hardware/nano).

## Pin map

Firmware file: `firmware/CleanKadalNano/CleanKadalNano.ino`.

| TB6612FNG module pin | Classic Nano pin | Purpose |
|---|---:|---|
| PWMA | D3 (PWM) | Motor A speed |
| AIN1 | D4 | Motor A direction input 1 |
| AIN2 | D7 | Motor A direction input 2 |
| PWMB | D5 (PWM) | Motor B speed |
| BIN1 | D8 | Motor B direction input 1 |
| BIN2 | D9 | Motor B direction input 2 |
| STBY | D2 | Driver standby; LOW means disabled |
| VCC | 5V logic rail | Driver logic supply; confirm the breakout board's requirements |
| VM | Separate motor-battery positive | Motor supply; use a voltage compatible with the driver board and motors |
| GND | Common ground | Join Nano GND, driver GND, and battery negative |
| A01/A02 | Motor A leads | First propulsion motor |
| B01/B02 | Motor B leads | Second propulsion motor |

D3 and D5 are PWM outputs on the **classic Nano**. Do not assume the same mapping for a different Nano-family board. The firmware keeps STBY LOW on startup and on stop, clamps each output to ±90/255, and stops if no valid motor command arrives for 650 ms.

## Power and noise notes

1. Use a battery selected for the motors' rated voltage and stall current, and a driver module rated for that load. Do not pick a battery based only on nominal motor current.
2. Connect battery positive to VM through an accessible physical switch; connect battery negative to driver GND.
3. Power the Nano over USB for programming/serial, unless you have a separately verified power design. Connect Nano GND to driver GND for a shared signal reference.
4. Connect the driver's logic VCC to the logic rail specified by the board. Do not connect two independent 5 V sources together.
5. Keep motor leads away from webcam USB and serial wiring; use short/twisted motor leads and suitable decoupling per the module/motor instructions to reduce electrical noise.
6. Verify polarity and wiring with the motor battery disconnected before applying power.

## Upload the firmware (Windows / Arduino IDE)

1. Install the Arduino IDE and connect the Nano by USB.
2. Open `firmware/CleanKadalNano/CleanKadalNano.ino`.
3. Select **Tools → Board → Arduino AVR Boards → Arduino Nano**.
4. Select the processor that matches the board. Many older Nano clones require **ATmega328P (Old Bootloader)**; if upload fails, check the board/USB-serial chip documentation and try the correct processor option.
5. Select **Tools → Port → COMx** for the Nano and click Upload.
6. Open **Tools → Serial Monitor**, set **115200 baud** and line ending **Newline**. On startup expect `READY,CleanKadalNano,115200`.
7. Send `Q`; expect `STATUS,<last-sequence>,<estop-0-or-1>,<left>,<right>`.

## Serial protocol

All messages are ASCII, one line terminated by `\n`, at 115200 baud.

| Command | Meaning |
|---|---|
| `Q` | Query the current sequence, emergency latch, and motor outputs |
| `M,<sequence>,<left>,<right>` | Set signed motor PWM values from -90 to 90; positive is forward, negative reverse, zero stop |
| `E` | Immediately stop and latch emergency stop |
| `R,<sequence>` | Reset an active emergency latch; motors remain stopped |

Responses include `STATUS,...`, `OK,M,...`, `OK,ESTOP`, `OK,RESET`, or `ERR,<reason>`. Repeated/out-of-order sequence numbers, malformed fields, and out-of-range PWM values are rejected. If valid motor heartbeats stop for 650 ms, the Arduino drops STBY LOW. Resetting the latch does not resume movement.

## Safe test sequence

1. Disconnect the motor battery. Upload firmware and query `Q` in Serial Monitor; confirm outputs are zero and emergency latch is clear.
2. Test validation with `M,1,200,200` (must be rejected) and a malformed command (must be rejected).
3. Send `M,1,0,0`; then stop sending motor commands and confirm the motor outputs stay off. To observe the timeout response, use a safe bench setup and send a low PWM command only after motors are connected.
4. Connect only one motor at first, with the motor battery switched off while wiring. Ensure the motor is restrained and propellers are removed.
5. Use the dashboard's **Connect Arduino** button. Choose the Nano port and wait for **Serial ready** after the status handshake.
6. Switch on the motor supply only for a controlled low-speed test. Hold a direction button briefly, release it, and confirm stop. Verify motor directions; if reversed, power off and swap that motor's leads or change the wiring configuration.
7. Press **EMERGENCY STOP**; verify the latch and outputs are off. Reset only deliberately, then verify the motors do not restart.
8. Test communication loss only with the boat secured and propellers removed: disconnect the USB/serial link and verify the Arduino's 650 ms timeout stops the driver.
9. Only after all contained tests pass should you consider water testing. Do **not** use the vision guidance around people, other boats, shorelines, or unknown depth.

## Dashboard behavior and limits

- Web Serial runs in the local browser and requires a compatible Chrome/Edge browser on HTTPS or localhost. The Vercel site itself cannot access a server-side USB port; the browser's explicit **Connect Arduino** permission connects to the Nano attached to that same computer.
- Manual direction buttons send a heartbeat while held and send a stop command on release. Browser/page loss is backed up by the Arduino's 650 ms timeout.
- Supervised guidance is **off by default**. It requires a ready serial link, active camera, loaded custom model, and a bottle candidate above at least 60% confidence. It only steers by image-space horizontal offset at low PWM, and stops on target loss, stale frame data, API error, camera loss, or manual disable.
- This is not obstacle detection, collision avoidance, geolocation, ranging, or a certified autonomous navigation system. A single ordinary webcam cannot estimate reliable physical distance without additional calibration/sensors.
