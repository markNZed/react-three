import React, { forwardRef, useRef, useImperativeHandle } from 'react';
import * as THREE from 'three';

const CompoundEntityGroup = forwardRef(({ children, position, userData }, ref) => {
    const internalRef = useRef();
    const impulseRef = useRef(new THREE.Vector3());
    const centerRef = useRef(new THREE.Vector3());

    useImperativeHandle(ref, () => ({
        get current() {
            return internalRef.current;
        },
        setImpulse: (newImpulse) => {
            impulseRef.current.copy(newImpulse);
        },
        getImpulse: () => {
            return impulseRef.current.clone();
        },
        addImpulse: (newImpulse) => {
            impulseRef.current.add(newImpulse);
        },
        getCenter: () => {
            if (centerRef.current) {
                return centerRef.current.clone();
            } else {
                return null;
            }
        },
        setCenter: (center) => {
            return centerRef.current.copy(center);
        },
        getCenterWorld: () => {
            if (centerRef.current) {
                return internalRef.current.localToWorld(centerRef.current.clone());
            } else {
                return null;
            }
        },
        worldToLocal: (vector) => {
            return internalRef.current.worldToLocal(vector);
        },
        localToWorld: (vector) => {
            return internalRef.current.localToWorld(vector);
        },
        getWorldPosition: (vector) => {
            return internalRef.current.getWorldPosition(vector);
        },
        getUserData: () => {
            if (internalRef.current) {
                return internalRef.current.userData;
            } else {
                return null;
            }
        },
        setUserData: (userData) => {
            internalRef.current.userData = userData;
        },
    }), [internalRef]);

    return (
        <group ref={internalRef} position={position} userData={userData}>
            {children}
        </group>
    );
});

export default CompoundEntityGroup;
