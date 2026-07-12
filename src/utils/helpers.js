// utils/helpers.js
export const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const sleep = (ms) => new Promise(r => setTimeout(r, ms));
