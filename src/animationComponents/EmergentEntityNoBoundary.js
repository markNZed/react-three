import React, { useEffect, useMemo, useRef } from 'react';
import { Sphere } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { RigidBody, RigidBodyApi, vec3, useRapier, MeshCollider } from '@react-three/rapier';
import * as THREE from 'three';
import { CSG } from 'three-csg-ts';
import withAnimationState from '../withAnimationState';

/*
<EmergentEntityNoBoundary
    id="emergent2"
    initialState={{
        position: new THREE.Vector3(+emergentEntityRadius * 2, 0, 0),
        radius: emergentEntityRadius,
        sphereCount: 100,
        color: "blue",
    }}
/>
*/

const EmergentEntityNoBoundary = React.forwardRef(({ id, animationState, ...props }, ref) => {
  const { 
    position, 
    radius, 
    sphereCount = 100, 
    withShell = true, 
    globalImpulseMagnitude = 0.1, 
    globalImpulseDirection = new THREE.Vector3(1, 0, 0),
    color = "blue",
  } = animationState;
  const sphereRefs = useRef([]);
  const reversedDirection = useRef(new Array(sphereCount).fill(false));
  const sphereRadius = radius / sphereCount * 10; // Radius of each sphere
  const sphereDiameter = sphereRadius * 2;
  const maxDisplacement = radius * 1; // Twice the radius

  const sphereData = useMemo(() => {
    const positions = generateSpherePositions(radius, sphereCount, sphereRadius);
    const directions = positions.map(() => new THREE.Vector3(
      (Math.random() - 0.5) * 0.2,
      (Math.random() - 0.5) * 0.2,
      (Math.random() - 0.5) * 0.2,
    ));
    return { positions, directions };
  }, [radius, sphereCount]);

  useEffect(() => {
    console.log("sphereData", sphereData, "sphereRadius", sphereRadius, "sphereDiameter", sphereDiameter);
  }, []);

  useFrame(() => {
    //const globalImpulseDirection = new THREE.Vector3(1, 0, 0); // Direction for global impulsion (e.g., along the x-axis)
    //const globalImpulseMagnitude = 0.01; // Magnitude of the global impulsion
    const globalImpulse = globalImpulseDirection.multiplyScalar(globalImpulseMagnitude);

    // Compute the dynamic group center
    const groupCenter = new THREE.Vector3();
    let activeSpheres = 0;

    sphereRefs.current.forEach((sphere) => {
      if (sphere) {
        const pos = sphere.translation();
        groupCenter.add(new THREE.Vector3(pos.x, pos.y, pos.z));
        activeSpheres++;
      }
    });

    if (activeSpheres > 0) {
      groupCenter.divideScalar(activeSpheres);
    }

    // Calculate displacement from the original position
    const displacement = groupCenter.clone().sub(new THREE.Vector3(...position));
    if (displacement.length() > maxDisplacement) {
      displacement.setLength(maxDisplacement);
      groupCenter.copy(new THREE.Vector3(...position).add(displacement));
    }

    sphereRefs.current.forEach((sphere, index) => {
      if (sphere) {
        const pos = sphere.translation();

        // Convert pos to a THREE.Vector3
        const posVector = new THREE.Vector3(pos.x, pos.y, pos.z);
        const localPos = posVector.clone().sub(groupCenter);

        let impulseMultiplier = radius * radius * 0.001; // relative to radius
        let repulseMultiplier = radius * radius * 0.05;

        // Check if the sphere is out of bounds and adjust direction towards the center
        if (!withShell) {
          if (localPos.length() > radius * 1.2) {
            const directionToCenter = groupCenter.clone().sub(posVector).normalize();
            sphereData.directions[index] = directionToCenter;
            impulseMultiplier = impulseMultiplier * 10;
          } else if (localPos.length() > radius) {
            if (!reversedDirection.current[index]) {
              // Get the current linear velocity of the sphere
              const velocity = sphere.linvel();

              // Reverse the direction
              const reversedVelocity = new THREE.Vector3(-velocity.x, -velocity.y, -velocity.z);

              // Update the direction with the reversed velocity
              sphereData.directions[index] = reversedVelocity.normalize();

              reversedDirection.current[index] = true; // Mark as reversed
            }
            impulseMultiplier = impulseMultiplier * 2;
          } else {
            // Reset reversed direction state if the sphere is back within the bounds
            reversedDirection.current[index] = false;
          }
        }

        // Apply an impulse to the sphere in the direction vector
        const direction = sphereData.directions[index];
        const impulse = { x: direction.x * impulseMultiplier, y: direction.y * impulseMultiplier, z: direction.z * impulseMultiplier };
        sphere.applyImpulse(impulse, true);

        // Apply the global impulsion to the sphere
        //sphere.applyImpulse(globalImpulse, true);

        // Apply a repulsion force to avoid clumping
        sphereRefs.current.forEach((otherSphere, otherIndex) => {
          if (otherSphere && otherIndex !== index) {
            const otherPos = otherSphere.translation();
            const otherPosVector = new THREE.Vector3(otherPos.x, otherPos.y, otherPos.z);
            const distance = posVector.distanceTo(otherPosVector);

            if (distance < sphereDiameter) {
              const repulsionForce = posVector.clone().sub(otherPosVector).normalize().multiplyScalar(repulseMultiplier);
              sphere.applyImpulse({ x: repulsionForce.x, y: repulsionForce.y, z: repulsionForce.z }, true);
            }
          }
        });
      }
    });
  });

  const shellGeometry = createShellGeometry(5, 4.9); // Slightly smaller inner sphere to ensure a thin shell

  return (
    <group position={position}>
      {sphereData.positions.map((pos, index) => (
        <RigidBody
          key={`${id}-sphere-${index}`}
          ref={el => sphereRefs.current[index] = el}
          position={pos}
          //linearVelocity={[sphereData.directions[index].x * 100, sphereData.directions[index].y * 100, 0]}
          type="dynamic"
          enabledTranslations={[true, true, false]}
          colliders="ball"
          linearDamping={0.5} // Add damping to smooth motion
          angularDamping={0.5}
        >
          <Sphere args={[sphereRadius, 8, 8]}>
            <meshStandardMaterial color={color} />
          </Sphere>
        </RigidBody>
      ))}

      {withShell &&
        <RigidBody type="fixed">
          <MeshCollider type="trimesh">
            <mesh geometry={shellGeometry}>
              <meshStandardMaterial transparent={true} opacity={0.5} color="red" wireframe side={THREE.DoubleSide} />
            </mesh>
          </MeshCollider>
        </RigidBody>
      }

    </group>
  );
});

export default withAnimationState(EmergentEntityNoBoundary);

const generateSpherePositions = (radius, count, sphereRadius) => {
  const positions = [];
  const diameter = radius * 2;

  // Calculate grid spacing to fit the square inside the circle
  const gridSpacing = diameter / Math.ceil(Math.sqrt(count));

  // Place spheres in a grid pattern within the circular boundary
  for (let y = -radius; y <= radius; y += gridSpacing) {
    for (let x = -radius; x <= radius; x += gridSpacing) {
      if (positions.length >= count) break;
      const distanceFromCenter = Math.sqrt(x * x + y * y);
      if (distanceFromCenter + sphereRadius <= radius) {
        positions.push(new THREE.Vector3(x, y, 0));
      }
    }
    if (positions.length >= count) break;
  }

  return positions;
};

const createShellGeometry = (outerRadius, innerRadius) => {
  const outerSphere = new THREE.Mesh(new THREE.SphereGeometry(outerRadius, 8, 8));
  const innerSphere = new THREE.Mesh(new THREE.SphereGeometry(innerRadius, 8, 8));
  const csg = CSG.subtract(outerSphere, innerSphere);
  return csg.geometry;
};
