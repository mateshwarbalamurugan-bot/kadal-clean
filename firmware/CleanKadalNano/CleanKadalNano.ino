#include <Arduino.h>
#include <stdlib.h>
#include <stdint.h>
#include <string.h>

// Target: classic Arduino Nano (ATmega328P) + TB6612FNG dual H-bridge.
// Motors are held in standby after reset, malformed commands, emergency stop,
// or loss of valid motor-command heartbeats.
const uint8_t PIN_STBY = 2;
const uint8_t PIN_PWMA = 3;  // Nano PWM-capable pin
const uint8_t PIN_AIN1 = 4;
const uint8_t PIN_AIN2 = 7;
const uint8_t PIN_PWMB = 5;  // Nano PWM-capable pin
const uint8_t PIN_BIN1 = 8;
const uint8_t PIN_BIN2 = 9;

const int MAX_PWM = 90;                       // Hard firmware limit (0..255 scale)
const unsigned long COMMAND_TIMEOUT_MS = 650; // Browser must refresh command < 650 ms
const size_t LINE_CAPACITY = 80;

char inputLine[LINE_CAPACITY];
size_t inputLength = 0;
bool discardingLongLine = false;
bool emergencyLatched = false;
bool motorsActive = false;
bool hasSequence = false;
unsigned long lastSequence = 0;
unsigned long lastMotorCommandMs = 0;
int currentLeft = 0;
int currentRight = 0;

void setMotor(uint8_t pwmPin, uint8_t in1Pin, uint8_t in2Pin, int speedValue) {
  int magnitude = abs(speedValue);
  if (magnitude > MAX_PWM) magnitude = MAX_PWM;
  if (speedValue > 0) {
    digitalWrite(in1Pin, HIGH);
    digitalWrite(in2Pin, LOW);
  } else if (speedValue < 0) {
    digitalWrite(in1Pin, LOW);
    digitalWrite(in2Pin, HIGH);
  } else {
    digitalWrite(in1Pin, LOW);
    digitalWrite(in2Pin, LOW);
  }
  analogWrite(pwmPin, magnitude);
}

void stopMotors() {
  analogWrite(PIN_PWMA, 0);
  analogWrite(PIN_PWMB, 0);
  digitalWrite(PIN_AIN1, LOW);
  digitalWrite(PIN_AIN2, LOW);
  digitalWrite(PIN_BIN1, LOW);
  digitalWrite(PIN_BIN2, LOW);
  digitalWrite(PIN_STBY, LOW);
  currentLeft = 0;
  currentRight = 0;
  motorsActive = false;
}

void reportStatus() {
  Serial.print(F("STATUS,"));
  Serial.print(lastSequence);
  Serial.print(',');
  Serial.print(emergencyLatched ? 1 : 0);
  Serial.print(',');
  Serial.print(currentLeft);
  Serial.print(',');
  Serial.println(currentRight);
}

bool parseLongStrict(const char *token, long *value) {
  if (token == NULL || *token == '\0') return false;
  char *end = NULL;
  long parsed = strtol(token, &end, 10);
  if (end == token || end == NULL || *end != '\0') return false;
  *value = parsed;
  return true;
}

bool isFreshSequence(unsigned long sequence) {
  if (!hasSequence) return true;
  // Signed difference handles ordinary unsigned wraparound and rejects stale or repeated commands.
  return (int32_t)(sequence - lastSequence) > 0;
}

void handleCommand(char *line) {
  char *savePointer = NULL;
  char *command = strtok_r(line, ",", &savePointer);
  if (command == NULL) {
    Serial.println(F("ERR,SYNTAX"));
    return;
  }

  if (strcmp(command, "Q") == 0) {
    if (strtok_r(NULL, ",", &savePointer) != NULL) {
      Serial.println(F("ERR,SYNTAX"));
      return;
    }
    reportStatus();
    return;
  }

  if (strcmp(command, "E") == 0) {
    if (strtok_r(NULL, ",", &savePointer) != NULL) {
      Serial.println(F("ERR,SYNTAX"));
      return;
    }
    emergencyLatched = true;
    stopMotors();
    lastMotorCommandMs = millis();
    Serial.println(F("OK,ESTOP"));
    return;
  }

  if (strcmp(command, "R") == 0) {
    char *sequenceToken = strtok_r(NULL, ",", &savePointer);
    char *extra = strtok_r(NULL, ",", &savePointer);
    long sequenceValue = -1;
    if (sequenceToken == NULL || extra != NULL || !parseLongStrict(sequenceToken, &sequenceValue) || sequenceValue < 0) {
      Serial.println(F("ERR,SYNTAX"));
      return;
    }
    if (!emergencyLatched) {
      Serial.println(F("ERR,NOT_LATCHED"));
      return;
    }
    unsigned long sequence = (unsigned long)sequenceValue;
    if (!isFreshSequence(sequence)) {
      Serial.println(F("ERR,STALE_SEQ"));
      return;
    }
    lastSequence = sequence;
    hasSequence = true;
    emergencyLatched = false;
    stopMotors();
    Serial.println(F("OK,RESET"));
    return;
  }

  if (strcmp(command, "M") == 0) {
    char *sequenceToken = strtok_r(NULL, ",", &savePointer);
    char *leftToken = strtok_r(NULL, ",", &savePointer);
    char *rightToken = strtok_r(NULL, ",", &savePointer);
    char *extra = strtok_r(NULL, ",", &savePointer);
    long sequenceValue = -1;
    long leftValue = 0;
    long rightValue = 0;
    if (sequenceToken == NULL || leftToken == NULL || rightToken == NULL || extra != NULL ||
        !parseLongStrict(sequenceToken, &sequenceValue) ||
        !parseLongStrict(leftToken, &leftValue) ||
        !parseLongStrict(rightToken, &rightValue) || sequenceValue < 0) {
      Serial.println(F("ERR,SYNTAX"));
      return;
    }
    if (emergencyLatched) {
      Serial.println(F("ERR,ESTOP_LATCHED"));
      return;
    }
    if (!isFreshSequence((unsigned long)sequenceValue)) {
      Serial.println(F("ERR,STALE_SEQ"));
      return;
    }
    if (leftValue < -MAX_PWM || leftValue > MAX_PWM || rightValue < -MAX_PWM || rightValue > MAX_PWM) {
      Serial.println(F("ERR,PWM_RANGE"));
      return;
    }

    lastSequence = (unsigned long)sequenceValue;
    hasSequence = true;
    lastMotorCommandMs = millis();
    currentLeft = (int)leftValue;
    currentRight = (int)rightValue;

    if (currentLeft == 0 && currentRight == 0) {
      stopMotors();
    } else {
      digitalWrite(PIN_STBY, HIGH);
      setMotor(PIN_PWMA, PIN_AIN1, PIN_AIN2, currentLeft);
      setMotor(PIN_PWMB, PIN_BIN1, PIN_BIN2, currentRight);
      motorsActive = true;
    }
    Serial.print(F("OK,M,"));
    Serial.print(lastSequence);
    Serial.print(',');
    Serial.print(currentLeft);
    Serial.print(',');
    Serial.println(currentRight);
    return;
  }

  Serial.println(F("ERR,UNKNOWN_COMMAND"));
}

void setup() {
  pinMode(PIN_STBY, OUTPUT);
  pinMode(PIN_PWMA, OUTPUT);
  pinMode(PIN_AIN1, OUTPUT);
  pinMode(PIN_AIN2, OUTPUT);
  pinMode(PIN_PWMB, OUTPUT);
  pinMode(PIN_BIN1, OUTPUT);
  pinMode(PIN_BIN2, OUTPUT);
  stopMotors();
  Serial.begin(115200);
  lastMotorCommandMs = millis();
  Serial.println(F("READY,CleanKadalNano,115200"));
}

void loop() {
  while (Serial.available() > 0) {
    char incoming = (char)Serial.read();
    if (incoming == '\r') continue;
    if (incoming == '\n') {
      if (discardingLongLine) {
        Serial.println(F("ERR,LINE_TOO_LONG"));
        discardingLongLine = false;
        inputLength = 0;
      } else {
        inputLine[inputLength] = '\0';
        handleCommand(inputLine);
        inputLength = 0;
      }
    } else if (!discardingLongLine) {
      if (inputLength < LINE_CAPACITY - 1) {
        inputLine[inputLength++] = incoming;
      } else {
        discardingLongLine = true;
        inputLength = 0;
      }
    }
  }

  if (motorsActive && millis() - lastMotorCommandMs > COMMAND_TIMEOUT_MS) {
    stopMotors();
    Serial.println(F("TIMEOUT,STOP"));
  }
}
