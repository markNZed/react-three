import React, { useEffect, useMemo, useRef, useImperativeHandle, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Circle as CircleDrei, Text } from '@react-three/drei';
import RigidBody from './RigidBody';
import CustomGroup from './CustomGroup'; 
import * as THREE from 'three';
import withAnimationState from '../withAnimationState';
import { Circle } from './';
import useStore from '../useStore';
import { useSphericalJoint } from '@react-three/rapier';

// Add a repellant force 
// requestAnimationFrame aims to achieve a refresh rate of 60 frames per second (FPS). 
// This means that each frame has about 16.67 milliseconds for all the rendering and updates to occur.

// Use https://github.com/pmndrs/react-three-rapier/tree/main/packages/react-three-rapier-addons#attractors
// Use https://github.com/pmndrs/react-three-rapier?tab=readme-ov-file#instanced-meshes

const RopeJoint = ({ a, b, ax, ay, az, bx, by, bz }) => {
  const scale = 1.5;
  useSphericalJoint(a, b, [
    [ax * scale, ay * scale, az * scale],
    [bx * scale, by * scale, bz * scale]
  ])
  return null
}

const Particle = React.forwardRef(({ id, i, jointPosition, initialPosition, radius, color, text="test" }, ref) => {
  const internalRef = useRef();
  const jointRadius = radius/10;

  useImperativeHandle(ref, () => internalRef.current);

  useFrame(() => {
    if (internalRef.current.applyImpulses) {
      internalRef.current.applyImpulses();
    }
  });

  return (
    <>
    <RigidBody
      ref={internalRef}
      position={initialPosition}
      type="dynamic"
      colliders="ball"
      linearDamping={0.5}
      angularDamping={0.5}
      enabledTranslations={[true, true, false]}
      enabledRotations={[false, false, true]}
    >
      <CircleDrei args={[radius, 16]}>
        <meshStandardMaterial color={color} />
      </CircleDrei>
    </RigidBody>
    <Text
      position={[initialPosition[0], initialPosition[1], 0.1]} // Slightly offset in the z-axis to avoid z-fighting
      fontSize={radius / 2} // Adjust font size based on circle radius
      color="black"
      anchorX="center"
      anchorY="middle"
    >
      {i}
    </Text>
    <CircleDrei 
      args={[jointRadius, 16]} 
      position={[initialPosition[0] + jointPosition.ax, initialPosition[1] + jointPosition.ay, 0.2]}
    >
    </CircleDrei>  
  </>
  );
});

const EmergentEntity = React.forwardRef(({ id, initialPosition = [0, 0, 0], scope = 1, radius, entityCount, Entity, color = "blue" }, ref) => {
  const getComponentRef = useStore((state) => state.getComponentRef);
  const entityRefs = Array.from({ length: entityCount }, () => useRef());
  const emergentEntityArea = areaOfCircle(radius);
  const entityRadius = (radius * Math.PI / (entityCount + Math.PI)) * 0.95;
  const entityArea = areaOfCircle(entityRadius);
  const emergentEntityDensity = emergentEntityArea / (entityArea * entityCount)
  const entityData = useMemo(() => {
    const positions = generateEntityPositions(radius - entityRadius, entityCount, entityRadius);
    return { positions };
  }, [radius, entityCount]);
  const jointData = useMemo(() => {
    const positions = generateEntityPositions(radius - entityRadius, entityCount);
    return calculateJointPositions(positions, entityRadius);
  }, [radius, entityCount]);
  const [initialImpulse, setInitialImpulse] = useState(true);
  const frameCount = useRef(0);
  const applyCount = useRef(0);
  const maxDisplacement = radius;
  const prevEmergentCenter = useRef();
  const internalRef = useRef();
  const zeroVector = new THREE.Vector3();
  const frameState = useRef("init");
  const emergentCenterRef = new THREE.Vector3();
  const initialPositionVector = new THREE.Vector3(initialPosition[0], initialPosition[1], initialPosition[2]);
  const emergentImpulseRef = useRef();
  const [addJoints, setAddJoints] = useState(false);

  useImperativeHandle(ref, () => internalRef.current);

  const impulseScale = entityArea * 0.05;
  const initialImpulseVectors = Array.from({ length: entityRefs.length }, () => new THREE.Vector3(
          (Math.random() - 0.5) * impulseScale * 2,
          (Math.random() - 0.5) * impulseScale * 2,
          (Math.random() - 0.5) * impulseScale * 2
      ));

  useEffect(() => {
    //console.log("entityData", id, "scope", scope, "radius", radius, "entityData", entityData, "entityRefs", entityRefs, "initialImpulseVectors", initialImpulseVectors);
    //if (scope == 3) console.log("entityRefs[1] entityRefs[0]", entityRefs[1], entityRefs[0]);
    //console.log("jointData", jointData);
  }, []);

  const calculateEmergentCenter = () => {
    const emergentCenter = new THREE.Vector3();
    let activeEntities = 0;
    entityRefs.forEach((entity) => {
      if (entity.current) {
        const entityCenter = entity.current.getCenter();
        if (entityCenter) {
          emergentCenter.add(entityCenter);
          activeEntities++;
        }
      }
    });
    if (activeEntities > 0) {
      emergentCenter.divideScalar(activeEntities);
    }
    return emergentCenter;
  };

  const addImpulses = (emergentCenter, emergentImpulse, subsetIndices) => {
    subsetIndices.forEach((i) => {
      const entity = entityRefs[i];
      if (entity.current) {
        const entityCenter = entity.current.getCenter();
        if (entityCenter) {
          const displacement = entityCenter.sub(emergentCenter);

          if (displacement.length() > maxDisplacement) {
            const overshoot = displacement.length() - maxDisplacement;
            const directionToCenter = displacement.negate().normalize();
            directionToCenter.multiplyScalar(impulseScale * 0.1);
            entity.current.addImpulse(directionToCenter);
          } else {
            entity.current.addImpulse(emergentImpulse);
          }
        }
      }
    });
  };

  useFrame(() => {
    const startTime = performance.now(); // Start timing
  
    frameCount.current += 1;
  
    //if (frameCount.current % 10 !== 0) return // every X frames
  
    switch (frameState.current) {
      case "init":
        if (initialImpulse && entityRefs[0].current) {
          setInitialImpulse(false);
          entityRefs.forEach((entity, i) => {
            if (entity.current && scope != 1) {
              // Add an impulse that is unique to each entity
              entity.current.addImpulse(initialImpulseVectors[i]);
            }
          });
          frameState.current = "findCenter";
          setAddJoints(true);
        }
        break;
      case "findCenter":
        emergentCenterRef.current = (scope == 1) ? initialPositionVector : calculateEmergentCenter();
        internalRef.current.setCenter(emergentCenterRef.current);
        if (prevEmergentCenter.current) {
          frameState.current = "calcImpulse";
        }
        break;
      case "calcImpulse":
        const displacement = emergentCenterRef.current.clone().sub(prevEmergentCenter.current);
        const emergentImpulseDirection = displacement.normalize(); // keep moving in the direction of the impulse
        emergentImpulseRef.current = emergentImpulseDirection.multiplyScalar(impulseScale * emergentEntityDensity);
        frameState.current = "addImpulse";
        break;
      case "addImpulse":
        entityRefs.forEach((entity, i) => {
          if (entity.current) {
            entity.current.addImpulse(internalRef.current.getImpulse());
          } else {
            console.log("No entity", id, i);
          }
        });
        internalRef.current.setImpulse(zeroVector);
        frameState.current = "entityImpulses";
        break;
      case "entityImpulses":
        applyCount.current += 1;
  
        // Calculate 10% of entities per frame
        const numEntitiesToUpdate = Math.ceil(entityRefs.length * 0.1);
        const startIndex = (applyCount.current % Math.ceil(entityRefs.length / numEntitiesToUpdate)) * numEntitiesToUpdate;
        const subsetIndices = Array.from({ length: numEntitiesToUpdate }, (_, i) => (startIndex + i) % entityRefs.length);
  
        //console.log("applyCount", id, startIndex)
        addImpulses(emergentCenterRef.current, emergentImpulseRef.current, subsetIndices);
  
        if (startIndex + numEntitiesToUpdate >= entityRefs.length) {
          frameState.current = "findCenter";
        }
        break;
      default:
        break;
    }
  
    if (emergentCenterRef.current) {
      prevEmergentCenter.current = emergentCenterRef.current.clone();
    }
  
    const circleCenterRef = getComponentRef(`${id}.CircleCenter`);
    if (circleCenterRef && circleCenterRef.current && internalRef.current && emergentCenterRef.current) {
      // Convert the emergentCenterRef.current to the local space of the CustomGroup
      const localCenter = internalRef.current.worldToLocal(emergentCenterRef.current.clone());
      circleCenterRef.current.position.copy(localCenter);
    }
  
    const endTime = performance.now(); // End timing
    const frameTime = endTime - startTime;
    if (frameTime > 16) {
      console.log(`Frame time: ${frameTime.toFixed(3)} ms`,id, frameState.current);
    }
  });
  

  const showScopes = true;

  return (
    <CustomGroup ref={internalRef} position={initialPosition}>
      {entityData.positions.map((pos, i) => (
        <Entity
          key={`${id}-${i}`}
          id={`${id}-${i}`}
          initialPosition={pos.toArray()}
          radius={entityRadius}
          color={color}
          scope={scope + 1}
          ref={entityRefs[i]}
          i={i}
          jointPosition={jointData[i]}
        />
      ))}
      
      {scope == 3 && addJoints && entityRefs.map((ref, i) => (
        <React.Fragment key={`fragment-${i}`}>
          {i > 0 && 
            <RopeJoint 
              a={entityRefs[i - 1].current} 
              b={ref.current} 
              ax={jointData[i-1].ax} 
              ay={jointData[i-1].ay} 
              az={jointData[i-1].az} 
              bx={jointData[i].bx} 
              by={jointData[i].by} 
              bz={jointData[i].bz} 
              key={`${id}-${i}-rope`} 
            />}
          {i === entityRefs.length - 1 && 
            <RopeJoint 
              a={ref.current} 
              b={entityRefs[0].current}
              ax={jointData[entityRefs.length - 1].ax} 
              ay={jointData[entityRefs.length - 1].ay} 
              az={jointData[entityRefs.length - 1].az} 
              bx={jointData[0].bx} 
              by={jointData[0].by} 
              bz={jointData[0].bz} 
              key={`${id}-${i}-last-to-first-rope`} 
            />}
        </React.Fragment>
      ))}
      
      {showScopes && (
        <>
          <Circle 
            id={`${id}.Circle`} 
            initialState={{ 
              radius: radius, 
              color: color,
              opacity: 0,
            }}  
          />
          <Circle 
            id={`${id}.CircleCenter`} 
            initialState={{ 
              radius: radius, 
              color: color,
              opacity: 0.2,
            }}  
          />
        </>
      )}
    </CustomGroup>
  );
});

const EntityScope3 = React.forwardRef((props, ref) => (
  <EmergentEntity id={"Scope3"} {...props} ref={ref} Entity={Particle} entityCount={9} />
));

const EntityScope2 = React.forwardRef((props, ref) => (
  <EmergentEntity id={"Scope2"} {...props} ref={ref} Entity={EntityScope3} entityCount={9} color={getRandomColor()} />
));

const EntityScopes = React.forwardRef((props, ref) => (
  <EmergentEntity id={"Scope1"} {...props} ref={ref} Entity={EntityScope2} entityCount={9} />
));

export default withAnimationState(EntityScopes);

const generateEntityPositions = (radius, count) => {
  const positions = []
  const angleStep = (2 * Math.PI) / count
  for (let i = 0; i < count; i++) {
    const angle = i * angleStep
    const x = radius * Math.cos(angle)
    const y = radius * Math.sin(angle)
    positions.push(new THREE.Vector3(x, y, 0))
  }
  return positions
}

const getRandomColor = () => {
  const letters = '0123456789ABCDEF';
  let color = '#';
  for (let i = 0; i < 6; i++) {
    color += letters[Math.floor(Math.random() * 16)];
  }
  return color;
};

const areaOfCircle = (radius) => {
  if (radius <= 0) {
    return "Radius must be a positive number.";
  }
  return Math.PI * Math.pow(radius, 2);
};

const calculateJointPositions = (positions, entityRadius) => {
  const jointPositions = positions.map((pos, i) => {
    const nextPos = positions[(i + 1) % positions.length];
    return {
      ax: entityRadius * Math.cos(Math.atan2(nextPos.y - pos.y, nextPos.x - pos.x)),
      ay: entityRadius * Math.sin(Math.atan2(nextPos.y - pos.y, nextPos.x - pos.x)),
      az: 0,
      bx: -entityRadius * Math.cos(Math.atan2(nextPos.y - pos.y, nextPos.x - pos.x)),
      by: -entityRadius * Math.sin(Math.atan2(nextPos.y - pos.y, nextPos.x - pos.x)),
      bz: 0,
    };
  });
  return jointPositions;
};