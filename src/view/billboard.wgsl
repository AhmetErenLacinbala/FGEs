struct TransformData {
  view: mat4x4<f32>,
  projection: mat4x4<f32>,
};

struct ObjectData {
  model: array<mat4x4<f32>>
};

@group(0) @binding(0) var<uniform> transformUBO: TransformData;
@group(0) @binding(1) var<storage, read> objects: ObjectData;

@group(1) @binding(0) var myTexture: texture_2d<f32>;
@group(1) @binding(1) var mySampler: sampler;

struct VSOut {
  @builtin(position) Position: vec4<f32>,
  @location(0) TexCoord: vec2<f32>,
};

@vertex
fn vs_main(
  @builtin(instance_index) ID: u32,
  @location(0) vertexPosition: vec3<f32>,
  @location(1) vertexTexCoord: vec2<f32>
) -> VSOut {
  let model = objects.model[ID];

  // World-space center from model translation
  let centerWS = vec3<f32>(model[3].x, model[3].y, model[3].z);

  let sx = length(vec3<f32>(model[0].x, model[0].y, model[0].z));
  let sy = length(vec3<f32>(model[1].x, model[1].y, model[1].z));
  let v = transformUBO.view;

  let rightWS = normalize(vec3<f32>(v[0].x, v[1].x, v[2].x));
  let upWS    = normalize(vec3<f32>(v[0].y, v[1].y, v[2].y));

  // Build billboard vertex in world space using quad local x/y
  let local = vertexPosition.xy; // expect -0.5..0.5
  let worldPos =
    centerWS
    + rightWS * (local.x * sx)
    + upWS    * (local.y * sy);

  var out: VSOut;
  out.Position = transformUBO.projection * transformUBO.view * vec4<f32>(worldPos, 1.0);
  out.TexCoord = vertexTexCoord;
  return out;
}

@fragment
fn fs_main(@location(0) TexCoord: vec2<f32>) -> @location(0) vec4<f32> {
  return textureSample(myTexture, mySampler, TexCoord);
}
