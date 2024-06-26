import * as THREE from 'three';
import { useRapier, vec3 } from '@react-three/rapier';
import useStoreEntity from './useStoreEntity';
const { getNode, getJoint, addJoint, storeDeleteJoint } = useStoreEntity.getState();
import * as utils from './utils';

// Remember custom hook can generate renders in the Component so be careful with Zustand stores

const useJoints = () => {

    const { world, rapier } = useRapier();
    // Be careful not to have this sensitive to updates to nodes
    // Direct access to the state outside of React's render flow
    const { getNodeProperty: directGetNodeProperty, 
            addJoints: directAddJoints, 
            getAllParticleRefs: directGetAllParticleRefs } = useStoreEntity.getState();
    const particleRadius = directGetNodeProperty('root', 'particleRadius');

    const allocateJointsToParticles = (node, chainRef, entityPositions) => {
        const nodeRef = node.ref;
        const worldPosition = new THREE.Vector3();
        nodeRef.current.getWorldPosition(worldPosition);
        const particleWorldPosition = new THREE.Vector3();

        const entitiesParticlesRefs = [];
        node.childrenIds.forEach(childId => {
            entitiesParticlesRefs.push(directGetAllParticleRefs(childId))
        });

        const jointsData = generateJointsData(entityPositions);

        const allocatedJoints = jointsData.map((jointData, i) => {

            // The data is organized into entities to ensure the second closet particle is in a different entity
            // Would be good to not need the data structure din this way
            // Could loop over entities instead of entitiesParticlesRefs ?

            const resultA = findClosestParticle(entitiesParticlesRefs, jointData, worldPosition, null, particleWorldPosition);
            const closestParticleAPosition = resultA.closestParticlePosition;
            const particleAEntityIndex = resultA.particleEntityIndex;
            const closestParticleARef = resultA.closestParticleRef;

            const resultB = findClosestParticle(entitiesParticlesRefs, jointData, worldPosition, particleAEntityIndex, particleWorldPosition);
            const closestParticleBPosition = resultB.closestParticlePosition;
            const closestParticleBRef = resultB.closestParticleRef;

            const direction = new THREE.Vector3()
                .subVectors(closestParticleBPosition, closestParticleAPosition)
                .normalize();

            const offsetA = direction.clone().multiplyScalar(particleRadius);
            const offsetB = direction.clone().multiplyScalar(-particleRadius);

            if (!closestParticleARef) {
                console.log("!closestParticleARef", node)
            }

            const uniqueIdA = closestParticleARef.getVisualConfig().uniqueId;
            const uniqueIdB = closestParticleBRef.getVisualConfig().uniqueId;

            if (chainRef.current[uniqueIdA]) {
                if (!chainRef.current[uniqueIdA].includes(uniqueIdB)) {
                    chainRef.current[uniqueIdA].push(uniqueIdB);
                }
            } else {
                chainRef.current[uniqueIdA] = [uniqueIdB];
            }
            if (chainRef.current[uniqueIdB]) {
                if (!chainRef.current[uniqueIdB].includes(uniqueIdA)) {
                    chainRef.current[uniqueIdB].push(uniqueIdA);
                }
            } else {
                chainRef.current[uniqueIdB] = [uniqueIdA];
            }

            return {
                a: {
                    ref: closestParticleARef,
                    offset: offsetA
                },
                b: {
                    ref: closestParticleBRef,
                    offset: offsetB
                },
            };
        });
        return allocatedJoints;
    };

    const initializeJoints = (node, entityPositions) => {
        const scope = node.depth;
        const nodeRef = node.ref;
        const chainRef = node.chainRef;
        const centerRef = new THREE.Vector3();
        centerRef.current = nodeRef.current.localToWorld(vec3(node.initialPosition));

        const newJoints = allocateJointsToParticles(node, chainRef, entityPositions);

        if (!newJoints.length) {
            // Happens if there is just one entity
            console.warn("No newJoints in initializeJoints");
            return;
        }

        // Prepare the updates first by aggregating them into a single array
        const allNewJoints = newJoints.reduce((acc, particles) => {
            const aIndex = particles.a.ref.getVisualConfig().uniqueId;
            const bIndex = particles.b.ref.getVisualConfig().uniqueId;
            const jointId = utils.jointId(aIndex, bIndex);
            return [...acc, jointId];
        }, []);

        // Distance to the first joint
        // We place the joints first because they will not align with the perimeter of the scope
        const jointPosition = newJoints[0].a.ref.translation();
        const jointPositionVector = new THREE.Vector3(jointPosition.x, jointPosition.y, jointPosition.z);
        const distanceToFirstJoint = centerRef.current.distanceTo(jointPositionVector) - particleRadius;

        node.particlesRef.current.forEach(particleRef => {
            const particlePosition = particleRef.current.translation();
            const particleVector = new THREE.Vector3(particlePosition.x, particlePosition.y, particlePosition.z);
            const distanceToCenter = centerRef.current.distanceTo(particleVector);
            const visualConfig = particleRef.current.getVisualConfig();
            if (!visualConfig.outerChain) visualConfig.outerChain = {};
            let outer = distanceToCenter >= (distanceToFirstJoint);
            visualConfig.outerChain[scope] = outer
            particleRef.current.setVisualConfig(visualConfig);
            // To debug the chains of particles
            //if (scope == 0 && outer) particleRef.current.getVisualConfig().color = "black";
        });

        // Create the joints
        const createJointResults = []
        newJoints.forEach((particles) => {
            // Offset needs to be in local coordinates - should be OK for 
            const a = {
                ref: particles.a.ref,
                offset: particles.a.offset,
            }
            const b = {
                ref: particles.b.ref,
                offset: particles.b.offset,
            }
            const jointRef = createJoint(a, b, true)
            createJointResults.push([particles.a.ref.getVisualConfig().uniqueId, particles.b.ref.getVisualConfig().uniqueId, jointRef]);
        });
        directAddJoints(createJointResults); // Because batch operation
    };

    const createJoint = (a, b, batch=false) => {
        const aVisualConfig = a.ref.getVisualConfig();
        const bVisualConfig = b.ref.getVisualConfig();
        const jointRef = { current: null }; // Create a plain object to hold the reference
        jointRef.current = world.createImpulseJoint(
            rapier.JointData.spherical(a.offset, b.offset),
            a.ref.current,
            b.ref.current,
            true
        );
        if (!batch) {
            addJoint(aVisualConfig.uniqueId, bVisualConfig.uniqueId, jointRef);
        }
        return jointRef;
    };
    
    const deleteJoint = (jointKey) => {
        const jointRef = getJoint(jointKey);
        const body1 = jointRef.current.body1();
        const body1Id = body1.getVisualConfig().uniqueId
        const body2 = jointRef.current.body2();
        const body2Id = body2.getVisualConfig().uniqueId
        if (jointRef.current) {
            const joint = jointRef.current;
            jointRef.current = undefined;
            if (world.getImpulseJoint(joint.handle)) {
                world.removeImpulseJoint(joint, true);
            }
            storeDeleteJoint(body1Id, body2Id);
        }
    };

    return {initializeJoints, deleteJoint, createJoint};
};

export default useJoints;

// Return the center point of all the joints
const generateJointsData = (positions) => {
    if (positions.length === 1) return [];
    const jointsData = positions.map((pos, i) => {
        let nextPos;
        if (i == positions.length - 1) {
            nextPos = positions[0];
        } else {
            nextPos = positions[i + 1];
        }

        // Calculate midpoint
        const midX = (pos.x + nextPos.x) / 2;
        const midY = (pos.y + nextPos.y) / 2;
        const midZ = (pos.z + nextPos.z) / 2;

        return {
            position: {
                x: midX,
                y: midY,
                z: midZ,
            },
        };
    });
    return jointsData;
};

function findClosestParticle(entitiesParticlesRefs, jointData, worldPosition, excludedEntityIndex, particleWorldPosition) {
    let minDistance = Infinity;
    let closestParticleIndex = -1;
    let closestParticlePosition = new THREE.Vector3();
    let particleEntityIndex = -1;
    let closestParticleRef;

    entitiesParticlesRefs.forEach((entityRefs, entityIndex) => {
        if (entityIndex === excludedEntityIndex) return;
        entityRefs.forEach((particleRef, j) => {
            const pos = particleRef.current.current.translation();
            particleWorldPosition.set(pos.x, pos.y, pos.z);
            const distance = particleWorldPosition.distanceTo(new THREE.Vector3(
                jointData.position.x + worldPosition.x,
                jointData.position.y + worldPosition.y,
                jointData.position.z + worldPosition.z
            ));
            if (distance < minDistance) {
                minDistance = distance;
                closestParticleIndex = j;
                closestParticlePosition.copy(particleWorldPosition);
                particleEntityIndex = entityIndex;
                closestParticleRef = particleRef.current;
            }
        });
    });

    return { minDistance, closestParticleIndex, closestParticlePosition, particleEntityIndex, closestParticleRef };
}

const calculateJointOffsets = (body1, body2, particleRadius) => {
    const body1position = body1.translation();
    const body2position = body2.translation();
    const direction = new THREE.Vector3()
        .subVectors(body1position, body2position)
        .normalize();
    const offset1 = direction.clone().multiplyScalar(-particleRadius);
    const offset2 = direction.clone().multiplyScalar(particleRadius);
    return { offset1, offset2 };
};