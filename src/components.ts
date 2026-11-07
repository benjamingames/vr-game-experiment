import { defineComponents } from '@iwsdk/core';
import {
  Dart,
  RCCar,
  RCControl,
  RCRemote,
  ResetButton,
  Resettable,
} from './ball-components.js';

export default defineComponents([
  Resettable,
  ResetButton,
  Dart,
  RCCar,
  RCRemote,
  RCControl,
]);
