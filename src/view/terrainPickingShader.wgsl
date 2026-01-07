// Terrain Picking Shader
// Uses TERRAIN_BUFFER_LAYOUT (position + normal + uv)

struct TransformData {
    view: mat4x4<f32>,
    projection: mat4x4<f32>,
};

struct ObjectData {
    model: array<mat4x4<f32>>
};

@group(0) @binding(0) var<uniform> transformUBO: TransformData;
@group(0) @binding(1) var<storage, read> objects: ObjectData;

struct VSOut {
    @builtin(position) Position: vec4<f32>,
    @location(0) worldPosition: vec3<f32>,
};

@vertex
fn vs_main(
    @builtin(instance_index) ID: u32,
    @location(0) vertexPosition: vec3<f32>,
    @location(1) vertexNormal: vec3<f32>,
    @location(2) vertexTexCoord: vec2<f32>
) -> VSOut {
    let model = objects.model[ID];
    let worldPos = model * vec4<f32>(vertexPosition, 1.0);
    
    var out: VSOut;
    out.Position = transformUBO.projection * transformUBO.view * worldPos;
    out.worldPosition = worldPos.xyz;
    return out;
}

@fragment
fn fs_main(@location(0) worldPosition: vec3<f32>) -> @location(0) vec4<f32> {
    return vec4<f32>(worldPosition, 1.0);
}

