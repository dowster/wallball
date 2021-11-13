/**
To change this license header, choose License Headers in Project Properties.
To change this template file, choose Tools | Templates
and open the template in the editor.
*/

/**
 
 @author dowbr
 */
public class Test 
{
   public static void main (String args[])
   {
      
      int paddleZone = 20;
      int fieldWidth = 500;
      int fieldHeight = 400;
      int drawX = 0;
      int drawY = 0;
      for (int x = -128; x < 128; x++) {
         for (int y = -128; y < 128; y++){
            int prevX = drawX;
            int prevY = drawY;
            
            drawX = paddleZone + (int) ((((float)x) + 128 ) / 255 * (fieldWidth - paddleZone * 2));
            drawY = (int) ((((float)-y) + 128 ) / 256 * fieldHeight);
            
            int deltaX = drawX - prevX;
            int deltaY = drawY - prevY;
            System.out.println("X: " + x + "\tY: " + y + "\tdrawX: " + drawX + "\tdrawY: " + drawY + "\tdeltaX: " + deltaX + "\tdeltaY: " + deltaY);
         }
      }
      
   }
}
