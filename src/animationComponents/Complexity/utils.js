import * as THREE from 'three';
import { quat } from '@react-three/rapier';

/**
 * Retrieves a color setting from a configuration object.
 * Allows for the color setting to be a static value or a function.
 *
 * @param {Object} config - Configuration object containing color settings.
 * @param {string} scope - The key under which the color setting is stored.
 * @param {*} defaultValue - A default value to return if the specific setting is not found.
 * @returns {*} - The color setting from the configuration or the default return value.
 */
export const getColor = (colorConfig, defaultValue) => {
    if (colorConfig === null || colorConfig === undefined) {
        return defaultValue;
    }
    if (typeof colorConfig === 'function') {
        return colorConfig();
    }
    return colorConfig;
};

export const calculateCircleArea = (radius) => {
    if (radius <= 0) {
        return "Radius must be a positive number.";
    }
    return Math.PI * Math.pow(radius, 2);
};

export const getRandomColorFn = () => {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
};

export const jointId = (id1, id2) => {
    return `${id1}-${id2}`;
}

export const jointIdToNodeIds = (jointId) => {
    let parts = jointId.split('-');
    const body1Id = parts[0];
    const body2Id = parts[1];
    return {body1Id, body2Id};
}

export const calculateJointOffsets = (body1, body2, body1Radius, body2Radius = null) => {
    const body1position = body1.translation();
    const body2position = body2.translation();
    const quaternion1 = quat(body1.rotation());
    // Invert so we counteract the body rotation
    quaternion1.invert();
    const quaternion2 = quat(body2.rotation());
    // Invert so we counteract the body rotation
    quaternion2.invert();
    const direction1 = new THREE.Vector3()
        .subVectors(body2position, body1position)
        .normalize();
    const direction2 = new THREE.Vector3()
        .subVectors(body1position, body2position)
        .normalize();
    const offset1 = direction1.clone().multiplyScalar(body1Radius);
    const offset2 = direction2.clone().multiplyScalar(body2Radius || body1Radius);
    offset1.applyQuaternion(quaternion1);
    offset2.applyQuaternion(quaternion2);
    return { offset1, offset2 };
};

export const calculateMidpoint = (body1, body2) => {
    const body1position = body1.translation();
    const body2position = body2.translation();
    const midpoint = new THREE.Vector3()
        .addVectors(body1position, body2position)
        .divideScalar(2);
    return midpoint;    
}

export const stringifyCircular = (obj) => {
    const seen = new WeakSet();
    return JSON.stringify(obj, (key, value) => {
        if (typeof value === "object" && value !== null) {
            if (seen.has(value)) {
                // Return some custom object or a marker indicating a circular reference
                return "[Circular]";
            }
            seen.add(value);
        }
        return value;
    });
}

export const arraysEqual = (arr1, arr2) => {
    if (arr1.length !== arr2.length) {
      return false; // Arrays of different lengths are not equal
    }
  
    for (let i = 0; i < arr1.length; i++) {
      if (arr1[i] !== arr2[i]) {
        return false; // If any corresponding elements differ, arrays are not equal
      }
    }
  
    return true; // If no elements differ, arrays are equal
}

export const vectorsAlmostEqual = (vec1, vec2, epsilon = 1e-6) => {
    return Math.abs(vec1.x - vec2.x) < epsilon &&
           Math.abs(vec1.y - vec2.y) < epsilon &&
           Math.abs(vec1.z - vec2.z) < epsilon;
  }
  