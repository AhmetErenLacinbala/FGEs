// Decal Projection Shader

struct DecalData {
    invViewProj: mat4x4<f32>,
    corner0: vec4<f32>,
    corner1: vec4<f32>,
    corner2: vec4<f32>,
    corner3: vec4<f32>,
    color: vec4<f32>,
};

@group(0) @binding(0) var depthTexture: texture_depth_2d;
@group(0) @binding(1) var<uniform> decalData: DecalData;

struct VSOut {
    @builtin(position) position: vec4<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VSOut {
    var positions = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>(3.0, -1.0),
        vec2<f32>(-1.0, 3.0)
    );
    
    var out: VSOut;
    out.position = vec4<f32>(positions[vertexIndex], 0.0, 1.0);
    return out;
}

fn reconstructWorldPosition(fragCoord: vec2<f32>, depth: f32) -> vec3<f32> {
    let screenSize = vec2<f32>(textureDimensions(depthTexture));
    
    let ndcX = (fragCoord.x / screenSize.x) * 2.0 - 1.0;
    let ndcY = 1.0 - (fragCoord.y / screenSize.y) * 2.0;
    
    let clipPos = vec4<f32>(ndcX, ndcY, depth, 1.0);
    let worldPos = decalData.invViewProj * clipPos;
    return worldPos.xyz / worldPos.w;
}

fn sign2D(p1: vec2<f32>, p2: vec2<f32>, p3: vec2<f32>) -> f32 {
    return (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
}

fn pointInTriangle(pt: vec2<f32>, v1: vec2<f32>, v2: vec2<f32>, v3: vec2<f32>) -> bool {
    let d1 = sign2D(pt, v1, v2);
    let d2 = sign2D(pt, v2, v3);
    let d3 = sign2D(pt, v3, v1);

    let hasNeg = (d1 < 0.0) || (d2 < 0.0) || (d3 < 0.0);
    let hasPos = (d1 > 0.0) || (d2 > 0.0) || (d3 > 0.0);

    return !(hasNeg && hasPos);
}

fn isInsideQuad(p: vec2<f32>) -> bool {
    let c0 = decalData.corner0.xy;
    let c1 = decalData.corner1.xy;
    let c2 = decalData.corner2.xy;
    let c3 = decalData.corner3.xy;
    
    // Split quad into 2 triangles and check both
    return pointInTriangle(p, c0, c1, c2) || pointInTriangle(p, c0, c2, c3);
}

@fragment
fn fs_main(@builtin(position) fragCoord: vec4<f32>) -> @location(0) vec4<f32> {
    let depthCoord = vec2<i32>(fragCoord.xy);
    let depth = textureLoad(depthTexture, depthCoord, 0);
    
    if (depth >= 0.9999) {
        discard;
    }
    
    let worldPos = reconstructWorldPosition(fragCoord.xy, depth);
    let pointXZ = vec2<f32>(worldPos.x, worldPos.z);
    
    if (!isInsideQuad(pointXZ)) {
        discard;
    }
    
    return decalData.color;
}
