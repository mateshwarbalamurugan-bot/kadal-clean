# Hardware source notes

Captured from primary manufacturer/board pages opened during the task:

- Toshiba TB6612FNG product page: https://toshiba.semicon-storage.com/us/semiconductor/product/motor-driver-ics/brushed-dc-motor-driver-ics/detail.TB6612FNG.html — source page displays absolute maximum VM 15 V and output current ratings 1.2 A average / 3.2 A peak, and links the current English datasheet. Do not treat maximum/peak figures as continuous safe design targets.
- Arduino classic Nano hardware page: https://docs.arduino.cc/hardware/nano — identifies the classic Nano separately from Nano 33 BLE, Nano Every, Nano ESP32, and other variants; it links the official pinout PDF.
- Official classic Nano pinout PDF: https://docs.arduino.cc/resources/pinouts/A000005-full-pinout.pdf — pin mapping reference for the D3/D5 PWM assignments used by the sketch.
