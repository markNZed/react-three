import React, { useRef, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import useStoreEntity from './useStoreEntity';

const Blob = ({ color, node, entityNodes }) => {
    const worldVector = new THREE.Vector3();
    const blobRef = useRef()
    const blobData = useRef()
    const { getNode, propagateVisualConfigValue, getparticlesHash, getAllParticleRefs } = useStoreEntity.getState();
    const { chainRef, id} = node;
    const worldToLocalFn = node.ref.current.worldToLocal;
    const [pressStart, setPressStart] = useState(0);
    const longPressThreshold = 500; // Time in milliseconds to distinguish a long press
    const particlesRef = useRef();
    const particlesHashRef = useRef();

    function buildBlobData() {

        //console.log("buildBlobData", id);
        blobData.current = {
            positions: [],
            flattenedIndexes: [],
            radii: [],
        };

        let blobOuterUniqueIds = [];
        let flattenedIndexes = [];
        let radii = [];
        particlesRef.current = getAllParticleRefs(id);
        const particles = particlesRef.current;
        for (let i = 0; i < particles.length; ++i) {
            if (!particles[i].current) {
                console.warn(`particles[i] ${i}, was empty`);
                continue;
            }
            const outer = particles[i].current.getVisualConfig().outer;
            if (outer) {
                let outerDepth = outer[node.depth];
                if (outerDepth) {
                    for (let j = Object.keys(outer).length - 1;j > node.depth; j--) {
                        if (!outer[j.toString()]) {
                            outerDepth = false;
                            break;
                        }
                    }
                }
                if (outerDepth) {
                    const uniqueId = particles[i].current.getVisualConfig().uniqueId;
                    blobOuterUniqueIds.push(uniqueId);
                    flattenedIndexes.push(i);
                    radii.push(particles[i].current.getVisualConfig().origRadius);
                }
            }
        }

        if (blobOuterUniqueIds.length < 3) {
            console.error("blobOuterUniqueIds < 3", id, blobOuterUniqueIds.length, particles.length);
            // Dealing with the case where there is only one or two particles
            // Which means there will be no blob, so no way to click on the blob and show the particle
            // This no longer works as there can be an intermediate state where blobOuterUniqueIds.length is < 3 but the
            // number of entities wil lbe more thean three.
            if (entityNodes.length < 3) {
                entityNodes.forEach(e => e.ref.current.setVisualConfig(p => ({ ...p, visible: false })));
            }
        }

        // buildOrderedIds can return null if there are no blobOuterUniqueIds
        const orderedIds = buildOrderedIds(id, chainRef, blobOuterUniqueIds) || [];
        if (!orderedIds.length) console.error("orderedIds is empty!", id);
        const blobIndexes = orderedIds;

        //console.log("buildBlobData", id, blobData, chainRef.current, particles, blobOuterUniqueIds, blobIndexes)

        for (let i = 0; i < blobIndexes.length; ++i) {
            blobData.current.positions.push(new THREE.Vector3());
            const indexInOuter = blobOuterUniqueIds.indexOf(blobIndexes[i]);
            const flattenedIndex = flattenedIndexes[indexInOuter];
            blobData.current.flattenedIndexes.push(flattenedIndex);
            blobData.current.radii.push(radii[indexInOuter]);
        }
    
    }

    useFrame(() => {

        const hash = getparticlesHash(id);

        if (hash !== particlesHashRef.current) {
            //if (id == "root") console.log("blobData getparticlesHash", id, hash);
            particlesHashRef.current = hash;
            buildBlobData();
        }

        if (!blobData.current) {
            //if (id == "root") console.log("!blobData.current", id);
            return;
        }

        if (node.ref.current.getVisualConfig().visible) {

            const particles = particlesRef.current;

            const blobPoints = blobData.current.positions.map((position, i) => {
                const flattenedIndex = blobData.current.flattenedIndexes[i]
                const pos = particles[flattenedIndex].current.translation();
                worldVector.set(pos.x, pos.y, pos.z);
                position.copy(worldToLocalFn(worldVector))
                return position;
            });

            if (blobPoints.length) {
                const geometry = points_to_geometry(blobPoints, blobData.current.radii);
                blobRef.current.geometry.dispose();
                blobRef.current.geometry = geometry;
                blobRef.current.visible = true;
            }

            //if (id == "root") console.log("blobData visible", blobPoints);


        } else {
            //if (id == "root") console.log("blobData blobRef.current.visible = false;", id);
            blobRef.current.visible = false;
        }

    });

    const handleOnClick = (event) => {
        //console.log("Blob handleOnClick", event);
        if (event.shiftKey) {
            return;
        }
        if (event.button !== 0) return;  // ignore two finger tap
        
        const pressDuration = Date.now() - pressStart;

        if (pressDuration < longPressThreshold) {
            let ancestorId = node.parentId;
            for (let i = node.depth - 1; i >= 0; i--) {
                const ancestorNode = getNode(ancestorId);
                if (ancestorNode.ref.current.getVisualConfig().visible) {
                    console.log(`Return because ${ancestorId} visible`);
                    return;
                }
                ancestorId = ancestorNode.parentId;
            }
            // If the node is about to become invisible
            if (node.ref.current.getVisualConfig().visible) {
                event.stopPropagation();
                entityNodes.forEach(nodeEntity => {
                    nodeEntity.ref.current.setVisualConfig(p => ({ ...p, visible: true }));
                });
                node.ref.current.setVisualConfig(p => ({ ...p, visible: false }));
            // If the number of overlapping blobs (intersections) is equal to the depth of this blob
            // then we will show this blob
            } else if (event.intersections.length === (node.depth + 1)) { 
                event.stopPropagation();
                // The order of the blob rendering means everything will disappear
                // causing a "flashing" effect
                node.ref.current.setVisualConfig(p => ({ ...p, visible: true }));
                setTimeout(() => {
                    entityNodes.forEach(nodeEntity => {
                        propagateVisualConfigValue(nodeEntity.id, 'visible', false);
                    });
                }, 0); // Introduce a slight delay to avoid flashing
            } 
        }
    };

    const handleOnContextMenu = handleOnContextMenuFn(getNode, propagateVisualConfigValue);

    const handlePointerDown = (event) => {
        //console.log("Blob handlePointerDown", event);
        if (event.button !== 0) return; // ignore two finger tap
        setPressStart(Date.now());
    };
    
    return (
        <mesh ref={blobRef}
            onPointerDown={handlePointerDown}
            onPointerUp={handleOnClick}
            onContextMenu={(event) => handleOnContextMenu(event)}>
            <meshBasicMaterial color={color} />
        </mesh>
    );
};

export default Blob;

// Outside of component to avoid recreation on render

function calculateCenter(points) {
    let sum = new THREE.Vector3(0, 0, 0);
    points.forEach(point => {
        sum.add(point);
    });
    return sum.divideScalar(points.length);
}
 
const points_to_geometry = (points, radii) => {

    // Rather than expand we should just use the particle overlap - maybe Jeremy could look into this?
    const expandPointsFromCenter = (points, radii, center) => {
        return points.map((point, i) => {
            const distance = radii[i];
            const direction = new THREE.Vector3().subVectors(point, center).normalize();
            //console.log("direction", direction, distance, center);
            return new THREE.Vector3(
                point.x + direction.x * distance,
                point.y + direction.y * distance,
                point.z + direction.z * distance
            );
        });
    };

    // We calculate the center rather than using the entity center (which is more like a center of gravity than a geometric center)
    const center = calculateCenter(points);

    // These are very different
    //console.log("center", center, centerRef.current);

    // Offset the points before creating the curve
    const expandedPoints = expandPointsFromCenter(points, radii, center);
    //const expandedPoints = points;

    const curve = new THREE.CatmullRomCurve3(expandedPoints, true);
    const oneToOnePoints = curve.getPoints(expandedPoints.length);
    const shape = new THREE.Shape(oneToOnePoints);
    const shape_geometry = new THREE.ShapeGeometry(shape);

    return shape_geometry;
};

function handleOnContextMenuFn(getNode, propagateVisualConfigValue) {
    return (event) => {
        //console.log("Blob handleOnContextMenuFn", event);
        event.stopPropagation();
        const rootNode = getNode("root");
        rootNode.ref.current.setVisualConfig(p => ({ ...p, visible: true }));
        setTimeout(() => {
            rootNode.childrenIds.forEach(childId => {
                propagateVisualConfigValue(childId, 'visible', false);
            });
        }, 0); // Introduce a slight delay to avoid flashing
    };
}

/**
 * Recursively builds the ordered list of indexes.
 * @param {Object} chainRef - Reference object containing the current state of chains.
 * @param {Array} blobOuterUniqueIds - Array of unique IDs representing the outer blob.
 * @param {string|null} [uniqueId=null] - The current unique ID to process.
 * @param {Set} [visited=new Set()] - A set of visited unique IDs to prevent infinite loops.
 * @returns {Array|null} Ordered list of indexes or null if a chainRef is dangling.
 */

// We use a chain of aprticles and it is possible that this excludes "points" e.g. three points can be on the outer and
// all have links, so the outer chain can "exclude" one of the points. Ideally we would not exclude points like this,
// It is visible in a [3,3,3] entity configuration

// visited should be specific to a "search" of the chain

function buildOrderedIds(id, chainRef, blobOuterUniqueIds, uniqueId = null, visited = new Set(), firstId = null, path = []) {

    //console.log("buildOrderedIds", id, uniqueId, JSON.stringify(chainRef.current), blobOuterUniqueIds);
    // Guard clause to prevent infinite loops
    if (visited.has(uniqueId)) {
        //console.log("buildOrderedIds visited", id, uniqueId);
        return null;
    }

    // Initialize uniqueId with the first element of blobOuterUniqueIds if null
    if (uniqueId === null) {
        uniqueId = blobOuterUniqueIds[0];
        firstId = uniqueId;
        //console.log("buildOrderedIds firstId", id, firstId, JSON.stringify(chainRef.current), blobOuterUniqueIds);
    } else {
        visited.add(uniqueId);
        if (uniqueId === firstId) return [...path, uniqueId];
    }

    //console.log("buildOrderedIds input", id, uniqueId); 
    
    // Guard clause to check if uniqueId is in blobOuterUniqueIds
    if (!blobOuterUniqueIds.includes(uniqueId)) {
        //console.log("buildOrderedIds not in outer", id, uniqueId); 
        return null;
    }

    const localPath = [...path, uniqueId];
    
    const linkedIndexes = chainRef.current[uniqueId] || [];

    // Search for the longest loop
    let foundChain = [];
    for (let linkedIndex of linkedIndexes) {
        //console.log("buildOrderedIds linkedIndex", id, uniqueId, linkedIndex, linkedIndexes, localPath);
        const clonedVisited = new Set([...visited]);
        const recursiveResult = buildOrderedIds(id, chainRef, blobOuterUniqueIds, linkedIndex, clonedVisited, firstId, localPath);
        if (recursiveResult) {
            // part of the chain being returned
            if (recursiveResult.length > foundChain.length) {
                foundChain = [uniqueId, ...recursiveResult];
                //console.log("buildOrderedIds foundChain", id, uniqueId, recursiveResult, foundChain);             
                //foundChain.forEach((id) => {visited.add(id)});
            }
        }
        //visited.add(linkedIndex);
    }
    //linkedIndexes.forEach((id) => {visited.add(id)});
    //foundChain.forEach((id) => {visited.add(id)});
    if (!foundChain.length) {
        return null;
    }

    //console.log("buildOrderedIds result", id, uniqueId, foundChain); 

    return foundChain;
}