// Online family sync settings (Firebase Cloud Firestore).
// Blank values = offline play (each phone keeps its own saves).
// These two values are public identifiers, not secrets; access is governed by
// the Firestore security rules and the family code.
// Setup steps: see README.md, "Online family sync".
window.CLOUD_CONFIG = window.CLOUD_CONFIG || {
  apiKey: 'AIzaSyAR2slGLZECC1wsLjcmCVNIRDupcfVxFeQ',
  projectId: 'harbor-merge',
};
