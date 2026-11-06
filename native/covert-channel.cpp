// Experimental CPU/WASM visual modem. No networking, file access, or OBS hooks.
static unsigned char pixels[1920*1080*4], bits[64800], headerMask[64800];
static float basis[128], soft[64800];
static unsigned char decoded[1348],trace[10800*64];
extern "C" {
void* memset(void* p,int value,__SIZE_TYPE__ n){volatile unsigned char* b=(volatile unsigned char*)p;for(__SIZE_TYPE__ i=0;i<n;i++)b[i]=(unsigned char)value;return p;}
void* memcpy(void* p,const void* q,__SIZE_TYPE__ n){volatile unsigned char* a=(volatile unsigned char*)p;const volatile unsigned char* b=(const volatile unsigned char*)q;for(__SIZE_TYPE__ i=0;i<n;i++)a[i]=b[i];return p;}
unsigned char* frame_ptr(){return pixels;} unsigned char* bits_ptr(){return bits;}
unsigned char* header_ptr(){return headerMask;}
float* basis_ptr(){return basis;} float* soft_ptr(){return soft;}
unsigned char* decoded_ptr(){return decoded;}
static int nearest(float x){return x>=0?(int)(x+.5f):(int)(x-.5f);}
static float dither(int block,int k,float step){unsigned int h=(block+1)*0x45d9f3bu^(k+1)*0x119de1f3u;h^=h>>16;h*=0x45d9f3bu;h^=h>>16;return ((h&65535)/65535.f*2-1)*step;}
void embed(int carriers,float step,int randomized){
 for(int by=0;by<1080;by+=8)for(int bx=0;bx<1920;bx+=8){
  float y[64],delta[64]={}; int block=(by/8)*240+bx/8;
  for(int j=0;j<64;j++){int i=((by+j/8)*1920+bx+j%8)*4;y[j]=.299f*pixels[i]+.587f*pixels[i+1]+.114f*pixels[i+2];}
  for(int k=0;k<carriers;k++){float s=headerMask[block*carriers+k]?64:step,c=0;for(int j=0;j<64;j++)c+=y[j]*basis[k*64+j];float offset=randomized?dither(block,k,s):0;int q=nearest((c-offset)/s);
   if((q&1)!=bits[block*carriers+k]){float a=(q-1)*s+offset-c,b=(q+1)*s+offset-c;q=(a*a<b*b)?q-1:q+1;}
   for(int j=0;j<64;j++)delta[j]+=(q*s+offset-c)*basis[k*64+j];
  }
  for(int j=0;j<64;j++){int i=((by+j/8)*1920+bx+j%8)*4;for(int k=0;k<3;k++){float v=pixels[i+k]+delta[j];pixels[i+k]=v<0?0:v>255?255:(int)(v+.5f);}}
 }
}
void extract(int carriers,float step,int randomized){
 for(int by=0;by<1080;by+=8)for(int bx=0;bx<1920;bx+=8){float y[64];int block=(by/8)*240+bx/8;
  for(int j=0;j<64;j++){int i=((by+j/8)*1920+bx+j%8)*4;y[j]=.299f*pixels[i]+.587f*pixels[i+1]+.114f*pixels[i+2];}
  for(int k=0;k<carriers;k++){float s=headerMask[block*carriers+k]?64:step,c=0;for(int j=0;j<64;j++)c+=y[j]*basis[k*64+j];float q=(c-(randomized?dither(block,k,s):0))/s,e=2*nearest(q/2),o=2*nearest((q-1)/2)+1;soft[block*carriers+k]=(q-e)*(q-e)-(q-o)*(q-o);}
 }
}
// One bit in the DIFFERENCE of two coefficients. The change is split between
// them, reducing disturbance per sample versus two independent bit carriers.
void embed_pair(float step){for(int by=0;by<1080;by+=8)for(int bx=0;bx<1920;bx+=8){float c[2]={},y[64];int block=(by/8)*240+bx/8;
 for(int j=0;j<64;j++){int i=((by+j/8)*1920+bx+j%8)*4;y[j]=.299f*pixels[i]+.587f*pixels[i+1]+.114f*pixels[i+2];for(int k=0;k<2;k++)c[k]+=y[j]*basis[k*64+j];}
 float d=c[0]-c[1],offset=dither(block,0,step);int q=nearest((d-offset)/step);if((q&1)!=bits[block]){float a=(q-1)*step+offset-d,b=(q+1)*step+offset-d;q=a*a<b*b?q-1:q+1;}float change=(q*step+offset-d)*.5f;
 for(int j=0;j<64;j++){int i=((by+j/8)*1920+bx+j%8)*4;float delta=change*(basis[j]-basis[64+j]);for(int k=0;k<3;k++){float v=pixels[i+k]+delta;pixels[i+k]=v<0?0:v>255?255:(int)(v+.5f);}}
}}
void extract_pair(float step){for(int by=0;by<1080;by+=8)for(int bx=0;bx<1920;bx+=8){float c=0;int block=(by/8)*240+bx/8;for(int j=0;j<64;j++){int i=((by+j/8)*1920+bx+j%8)*4;float y=.299f*pixels[i]+.587f*pixels[i+1]+.114f*pixels[i+2];c+=y*(basis[j]-basis[64+j]);}float q=(c-dither(block,0,step))/step,e=2*nearest(q/2),o=2*nearest((q-1)/2)+1;soft[block]=(q-e)*(q-e)-(q-o)*(q-o);}}
static int parity(unsigned int n){n^=n>>4;n^=n>>2;n^=n>>1;return n&1;}
void decode_fec3(){float previous[64],next[64];unsigned char codes[128];for(int i=0;i<64;i++)previous[i]=i?1e9f:0;for(int i=0;i<128;i++)codes[i]=parity(i&0171)|(parity(i&0133)<<1)|(parity(i&0165)<<2);
 for(int t=0;t<1348*8+6;t++){float costs[8];for(int v=0;v<8;v++){costs[v]=0;for(int k=0;k<3;k++)costs[v]+=(1+(((v>>k)&1)?-soft[t*3+k]:soft[t*3+k]))*.5f;}
  for(int s=0;s<64;s++){float a=previous[s>>1]+costs[codes[s]],b=previous[(s>>1)|32]+costs[codes[s|64]];next[s]=a<b?a:b;trace[t*64+s]=b<a;}for(int s=0;s<64;s++)previous[s]=next[s];}
 for(int i=0;i<1348;i++)decoded[i]=0;int state=0;for(int t=1348*8+5;t>=0;t--){if(t<1348*8)decoded[t>>3]|=(state&1)<<(7-(t&7));state=(state>>1)|(trace[t*64+state]<<5);}
}
}
