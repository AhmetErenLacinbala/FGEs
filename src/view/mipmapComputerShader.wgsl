@group(0) @binding(0) var inputTexture: texture_2d<f32>;
@group(0) @binding(1) var outputTexture: texture_storage_2d<rgba8unorm, write>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let srcCoord = id.xy * 2u;

    let c0 = textureLoad(inputTexture, srcCoord, 0);
    let c1 = textureLoad(inputTexture, srcCoord + vec2u(1, 0), 0);
    let c2 = textureLoad(inputTexture, srcCoord + vec2u(0, 1), 0);
    let c3 = textureLoad(inputTexture, srcCoord + vec2u(1, 1), 0);

    let avg = (c0 + c1 + c2 + c3) * 0.25;

    textureStore(outputTexture, id.xy, avg);
}
