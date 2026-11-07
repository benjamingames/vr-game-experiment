import { defineComponents } from '@iwsdk/core';
import {
  Dart,
  FacePart,
  FaceResetButton,
  RCCar,
  RCControl,
  RCRemote,
  ResetButton,
  Resettable,
  SkyCloud,
} from './ball-components.js';

export default defineComponents([
  Resettable,
  ResetButton,
  Dart,
  RCCar,
  RCRemote,
  RCControl,
  FacePart,
  FaceResetButton,
  SkyCloud,
]);
